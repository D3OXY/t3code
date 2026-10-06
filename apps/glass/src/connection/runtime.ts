import { Connection } from "@t3tools/client-runtime/connection";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { layerRemoteHttpClient } from "@t3tools/client-runtime/rpc";
import { ShellSnapshotLoader } from "@t3tools/client-runtime/state/shell";
import {
  BoundedThreadSnapshotLoader,
  ThreadHistoryController,
} from "@t3tools/client-runtime/state/threads";
import { RelayWebClientId } from "@t3tools/contracts/relay";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Atom } from "effect/reactivity";
import * as Socket from "effect/socket/Socket";

import * as ConnectionPlatform from "./platform";

const layerHttpClient = layerRemoteHttpClient((input, init) => globalThis.fetch(input, init));

const layerCrypto = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.promise(async () => {
        const input = new Uint8Array(data.length);
        input.set(data);
        return new Uint8Array(await globalThis.crypto.subtle.digest(algorithm, input.buffer));
      }),
  }),
);

// The relay client is required by the connection layer's types but only used
// for T3 Connect. An empty relay URL resolves to the disabled client, and the
// DPoP signer is never reached on bearer or cookie paths.
const layerDpopSigner = Layer.succeed(
  ManagedRelay.ManagedRelayDpopSigner,
  ManagedRelay.ManagedRelayDpopSigner.of({
    thumbprint: Effect.fail(
      new ManagedRelay.ManagedRelayDpopKeyLoadError({
        keyStore: "indexed-db",
        cause: "unsupported",
      }),
    ),
    createProof: (input) =>
      Effect.fail(
        new ManagedRelay.ManagedRelayDpopProofCreationError({
          method: input.method,
          url: input.url,
          cause: "unsupported",
        }),
      ),
  }),
);

const layerRelay = ManagedRelay.layer({ relayUrl: "", clientId: RelayWebClientId }).pipe(
  Layer.provideMerge(layerDpopSigner),
  Layer.provide(layerHttpClient),
);

const layerBase = Layer.mergeAll(
  layerHttpClient,
  Socket.layerWebSocketConstructorGlobal,
  layerRelay,
  layerCrypto,
);

const layerSnapshotLoaders = Layer.mergeAll(
  ShellSnapshotLoader.layer,
  BoundedThreadSnapshotLoader.layer,
  ThreadHistoryController.layer,
);

const layerConnection = layerSnapshotLoaders.pipe(
  Layer.provideMerge(Connection.layerWithOptions({ environmentThemes: true })),
  Layer.provideMerge(
    Layer.merge(layerBase, ConnectionPlatform.layer.pipe(Layer.provide(layerBase))),
  ),
);

/** The one atom runtime every environment-scoped atom and command runs on. */
export const connectionAtomRuntime = Atom.runtime(layerConnection);
