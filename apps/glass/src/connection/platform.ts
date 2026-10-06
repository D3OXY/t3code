import { ClientCapabilities, PlatformConnectionSource } from "@t3tools/client-runtime/platform";
import {
  ConnectionBlockedError,
  Connectivity,
  mapRemoteEnvironmentError,
  PrimaryConnectionRegistration,
  PrimaryConnectionTarget,
  Wakeups,
} from "@t3tools/client-runtime/connection";
import { fetchRemoteEnvironmentDescriptor } from "@t3tools/client-runtime/environment";
import {
  AuthStandardClientScopes,
  type AuthClientMetadataDeviceType,
  type AuthClientPresentationMetadata,
  type ClientOs,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import * as ConnectionStorage from "./storage";

function browserClientOs(userAgent: string): ClientOs {
  if (userAgent.trim() === "") return "unknown";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/cros/i.test(userAgent)) return "ChromeOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/macintosh|mac os x/i.test(userAgent)) return "macOS";
  if (/linux|x11/i.test(userAgent)) return "Linux";
  return "other";
}

function browserFamily(userAgent: string): string {
  if (/edg(?:e|a|ios)?\//i.test(userAgent)) return "Edge";
  if (/firefox\/|fxios\//i.test(userAgent)) return "Firefox";
  if (/chrome\/|crios\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent)) return "Safari";
  return "other";
}

function browserDeviceType(userAgent: string): AuthClientMetadataDeviceType {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/iphone|ipod|android.+mobile|mobile/i.test(userAgent)) return "mobile";
  return "desktop";
}

/** How this client introduces itself in the server's Connections list. */
export function glassClientMetadata(): AuthClientPresentationMetadata {
  const userAgent = navigator.userAgent;
  return {
    label: "T3 Glass",
    deviceType: browserDeviceType(userAgent),
    os: browserClientOs(userAgent),
    surface: "web",
    webDeployment: "server",
    browser: browserFamily(userAgent),
  };
}

const layerConnectivity = Connectivity.layer({
  status: Effect.sync(() => (navigator.onLine ? "online" : "offline")),
  changes: Stream.callback((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const online = () => Queue.offerUnsafe(queue, "online");
        const offline = () => Queue.offerUnsafe(queue, "offline");
        window.addEventListener("online", online);
        window.addEventListener("offline", offline);
        return { online, offline };
      }),
      ({ online, offline }) =>
        Effect.sync(() => {
          window.removeEventListener("online", online);
          window.removeEventListener("offline", offline);
        }),
    ).pipe(Effect.asVoid),
  ),
});

// Foregrounding the tab wakes a waiting connection so it retries immediately.
const layerWakeups = Wakeups.layer({
  changes: Stream.callback<"application-active">((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const listener = () => {
          if (document.visibilityState === "visible") {
            Queue.offerUnsafe(queue, "application-active");
          }
        };
        document.addEventListener("visibilitychange", listener);
        return listener;
      }),
      (listener) => Effect.sync(() => document.removeEventListener("visibilitychange", listener)),
    ).pipe(Effect.asVoid),
  ),
});

const unsupported = (detail: string) =>
  new ConnectionBlockedError({ reason: "unsupported", detail });

// Glass supports the same-origin primary environment and bearer-paired remotes.
// T3 Connect (relay), SSH and desktop bridges are desktop/web-app features, so
// their capabilities fail as unsupported instead of being half-wired.
const layerCapabilities = Layer.effectContext(
  Effect.sync(() =>
    Context.make(
      ClientCapabilities.ClientPresentation,
      ClientCapabilities.ClientPresentation.of({
        metadata: glassClientMetadata(),
        scopes: AuthStandardClientScopes,
      }),
    ).pipe(
      Context.add(
        ClientCapabilities.CloudSession,
        ClientCapabilities.CloudSession.of({
          identity: Effect.succeedNone,
          clerkToken: Effect.fail(unsupported("T3 Connect is not available in Glass.")),
        }),
      ),
      Context.add(
        ClientCapabilities.PrimaryEnvironmentAuth,
        // No bearer: the primary socket authenticates with the session cookie.
        ClientCapabilities.PrimaryEnvironmentAuth.of({ bearerToken: Effect.succeedNone }),
      ),
      Context.add(
        ClientCapabilities.RelayDeviceIdentity,
        ClientCapabilities.RelayDeviceIdentity.of({ deviceId: Effect.succeedNone }),
      ),
      Context.add(
        ClientCapabilities.SshEnvironmentGateway,
        ClientCapabilities.SshEnvironmentGateway.of({
          provision: () => Effect.fail(unsupported("SSH environments need the desktop app.")),
          prepare: () => Effect.fail(unsupported("SSH environments need the desktop app.")),
          disconnect: () => Effect.void,
        }),
      ),
    ),
  ),
);

const loadPrimaryRegistration = Effect.gen(function* () {
  const httpBaseUrl = `${window.location.origin}/`;
  const wsBaseUrl = httpBaseUrl.replace(/^http/, "ws");
  const descriptor = yield* fetchRemoteEnvironmentDescriptor({ httpBaseUrl }).pipe(
    Effect.mapError(mapRemoteEnvironmentError),
  );
  return new PrimaryConnectionRegistration({
    target: new PrimaryConnectionTarget({
      environmentId: descriptor.environmentId,
      label: descriptor.label,
      httpBaseUrl,
      wsBaseUrl,
    }),
  });
});

// The page's own origin is the primary environment. Each emission is the full
// platform set, so the source emits once the descriptor loads and then stays
// open: emitting [] after a failure would make the registry drop the primary.
const layerPrimarySource = Layer.effect(
  PlatformConnectionSource.PlatformConnectionSource,
  Effect.gen(function* () {
    const context = yield* Effect.context<HttpClient.HttpClient>();
    return PlatformConnectionSource.PlatformConnectionSource.of({
      registrations: Stream.fromEffect(
        loadPrimaryRegistration.pipe(
          Effect.tapError((error) =>
            Effect.logWarning("Could not discover the primary environment.", { error }),
          ),
          Effect.retry(Schedule.spaced("3 seconds")),
          // The retry above never gives up, so the error channel is unreachable.
          Effect.orDie,
          Effect.map((registration) => [registration] as const),
          Effect.provide(context),
        ),
      ).pipe(Stream.concat(Stream.never)),
    });
  }),
);

export const layer = Layer.mergeAll(
  ConnectionStorage.layer,
  layerConnectivity,
  layerWakeups,
  layerCapabilities,
  layerPrimarySource,
);
