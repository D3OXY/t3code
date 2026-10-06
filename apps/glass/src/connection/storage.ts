import {
  ConnectionCatalogDocument,
  type ConnectionCatalogDocument as ConnectionCatalogDocumentType,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  putRemoteDpopTokenInCatalog,
  registerConnectionInCatalog,
  removeCatalogValue,
  removeConnectionFromCatalog,
  replaceCatalogValue,
  setConnectionEnabledInCatalog,
  setRoutesInCatalog,
  Persistence,
} from "@t3tools/client-runtime/platform";
import { TokenStore } from "@t3tools/client-runtime/authorization";
import {
  ConnectionTransientError,
  CredentialStore,
  ProfileStore,
} from "@t3tools/client-runtime/connection";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

// Glass keeps its connection catalog (paired environments and their bearer
// credentials) in localStorage under its own key. It runs on its own origin,
// so it never shares saved remotes with apps/web.
const CATALOG_STORAGE_KEY = "glass:connection-catalog:v1";

const ConnectionCatalogDocumentJson = Schema.fromJsonString(ConnectionCatalogDocument);
const decodeCatalogDocument = Schema.decodeUnknownEffect(ConnectionCatalogDocumentJson);
const encodeCatalogDocument = Schema.encodeEffect(ConnectionCatalogDocumentJson);

function catalogError(operation: string, cause: unknown) {
  return new ConnectionTransientError({
    reason: "remote-unavailable",
    detail: `Could not ${operation} the local connection catalog: ${String(cause)}`,
  });
}

function persistenceError(
  operation:
    | "list-targets"
    | "list-disabled-targets"
    | "register-connection"
    | "set-connection-routes"
    | "remove-connection"
    | "set-connection-enabled",
  cause: unknown,
) {
  return new Persistence.ConnectionPersistenceError({
    operation,
    message: `Could not ${operation.replaceAll("-", " ")}: ${String(cause)}`,
  });
}

const readRaw = Effect.try({
  try: () => localStorage.getItem(CATALOG_STORAGE_KEY),
  catch: (cause) => catalogError("load", cause),
});

const writeRaw = (raw: string) =>
  Effect.try({
    try: () => localStorage.setItem(CATALOG_STORAGE_KEY, raw),
    catch: (cause) => catalogError("save", cause),
  });

/** A locked, cached view of the catalog document. A corrupt document resets to empty. */
const makeCatalogStore = Effect.gen(function* () {
  const state = yield* Ref.make<Option.Option<ConnectionCatalogDocumentType>>(Option.none());
  const lock = yield* Semaphore.make(1);

  const loadUnlocked = Effect.gen(function* () {
    const cached = yield* Ref.get(state);
    if (Option.isSome(cached)) return cached.value;
    const raw = yield* readRaw;
    const catalog =
      raw === null || raw.trim() === ""
        ? EMPTY_CONNECTION_CATALOG_DOCUMENT
        : yield* decodeCatalogDocument(raw).pipe(
            Effect.catch((error) =>
              Effect.logWarning("Discarding a corrupt glass connection catalog.", {
                error: error.message,
              }).pipe(Effect.as(EMPTY_CONNECTION_CATALOG_DOCUMENT)),
            ),
          );
    yield* Ref.set(state, Option.some(catalog));
    return catalog;
  });

  const read = lock.withPermits(1)(loadUnlocked);
  const update = (
    transform: (catalog: ConnectionCatalogDocumentType) => ConnectionCatalogDocumentType,
  ) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const next = transform(yield* loadUnlocked);
        const encoded = yield* encodeCatalogDocument(next).pipe(
          Effect.mapError((cause) => catalogError("encode", cause)),
        );
        yield* writeRaw(encoded);
        yield* Ref.set(state, Option.some(next));
      }),
    );

  return { read, update };
});

// Glass does not persist orchestration snapshots between reloads; the server
// streams a fresh snapshot on connect, so the cache store is a no-op.
const noopCacheStore = Persistence.EnvironmentCacheStore.of({
  loadShell: () => Effect.succeedNone,
  saveShell: () => Effect.void,
  loadThread: () => Effect.succeedNone,
  saveThread: () => Effect.void,
  removeThread: () => Effect.void,
  loadServerConfig: () => Effect.succeedNone,
  saveServerConfig: () => Effect.void,
  loadVcsRefs: () => Effect.succeedNone,
  saveVcsRefs: () => Effect.void,
  removeVcsRefs: () => Effect.void,
  clearVcsRefs: () => Effect.void,
  clear: () => Effect.void,
});

export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const catalog = yield* makeCatalogStore;

    const targetStore = Persistence.ConnectionTargetStore.of({
      list: catalog.read.pipe(
        Effect.map((document) => document.targets),
        Effect.mapError((cause) => persistenceError("list-targets", cause)),
      ),
      listDisabled: catalog.read.pipe(
        Effect.map((document) => document.disabledEnvironmentIds),
        Effect.mapError((cause) => persistenceError("list-disabled-targets", cause)),
      ),
    });
    const registrationStore = Persistence.ConnectionRegistrationStore.of({
      register: (registration, routes) =>
        catalog
          .update((document) => registerConnectionInCatalog(document, registration, routes))
          .pipe(Effect.mapError((cause) => persistenceError("register-connection", cause))),
      setRoutes: (environmentId, routes) =>
        catalog
          .update((document) => setRoutesInCatalog(document, environmentId, routes))
          .pipe(Effect.mapError((cause) => persistenceError("set-connection-routes", cause))),
      remove: (environmentId) =>
        catalog
          .update((document) => removeConnectionFromCatalog(document, environmentId))
          .pipe(Effect.mapError((cause) => persistenceError("remove-connection", cause))),
      setEnabled: (environmentId, enabled) =>
        catalog
          .update((document) => setConnectionEnabledInCatalog(document, environmentId, enabled))
          .pipe(Effect.mapError((cause) => persistenceError("set-connection-enabled", cause))),
    });
    const profileStore = ProfileStore.make({
      get: (connectionId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.profiles.find((profile) => profile.connectionId === connectionId),
            ),
          ),
        ),
      put: (profile) =>
        catalog.update((document) => ({
          ...document,
          profiles: replaceCatalogValue(document.profiles, (value) => value.connectionId, profile),
        })),
      remove: (connectionId) =>
        catalog.update((document) => ({
          ...document,
          profiles: removeCatalogValue(
            document.profiles,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const credentialStore = CredentialStore.make({
      get: (connectionId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.credentials.find((entry) => entry.connectionId === connectionId)?.credential,
            ),
          ),
        ),
      put: (connectionId, credential) =>
        catalog.update((document) => ({
          ...document,
          credentials: replaceCatalogValue(document.credentials, (value) => value.connectionId, {
            connectionId,
            credential,
          }),
        })),
      remove: (connectionId) =>
        catalog.update((document) => ({
          ...document,
          credentials: removeCatalogValue(
            document.credentials,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const remoteTokenStore = TokenStore.make({
      get: (environmentId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.remoteDpopTokens.find((token) => token.environmentId === environmentId),
            ),
          ),
        ),
      put: (token) => catalog.update((document) => putRemoteDpopTokenInCatalog(document, token)),
      remove: (environmentId) =>
        catalog.update((document) => ({
          ...document,
          remoteDpopTokens: removeCatalogValue(
            document.remoteDpopTokens,
            (value) => value.environmentId,
            environmentId,
          ),
        })),
    });

    return Context.make(Persistence.ConnectionTargetStore, targetStore).pipe(
      Context.add(Persistence.ConnectionRegistrationStore, registrationStore),
      Context.add(ProfileStore.ConnectionProfileStore, profileStore),
      Context.add(CredentialStore.ConnectionCredentialStore, credentialStore),
      Context.add(TokenStore.RemoteDpopAccessTokenStore, remoteTokenStore),
      Context.add(Persistence.EnvironmentCacheStore, noopCacheStore),
    );
  }),
);
