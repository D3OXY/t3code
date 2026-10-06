import { getPairingTokenFromUrl, stripPairingTokenFromUrl } from "@t3tools/shared/remote";

/**
 * Cookie-session auth against the primary (same-origin) server.
 *
 * The server sets an httpOnly session cookie when a pairing credential is
 * exchanged at /api/auth/browser-session, and the WebSocket upgrade carries the
 * same cookie. Cookies ignore ports, so a browser already paired with apps/web
 * on this hostname is already signed in here.
 */
export type AuthGateState =
  | { readonly status: "authenticated" }
  | { readonly status: "requires-auth"; readonly errorMessage?: string };

const SESSION_ESTABLISH_TIMEOUT_MS = 2_000;
const TRANSIENT_RETRY_TIMEOUT_MS = 15_000;
const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);

class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A server that is still booting answers 502-504 through the dev proxy, or the
// fetch rejects outright. Both settle within a few seconds, so retry briefly.
async function retryTransient<T>(operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      const transient =
        error instanceof TypeError ||
        (error instanceof AuthRequestError && TRANSIENT_STATUS_CODES.has(error.status));
      if (!transient || Date.now() - startedAt >= TRANSIENT_RETRY_TIMEOUT_MS) throw error;
      await sleep(500);
    }
  }
}

async function fetchSessionAuthenticated(): Promise<boolean> {
  return retryTransient(async () => {
    const response = await fetch("/api/auth/session", { credentials: "same-origin" });
    if (!response.ok) {
      throw new AuthRequestError(`Session check failed (${response.status}).`, response.status);
    }
    const body = (await response.json()) as { readonly authenticated?: unknown };
    return body.authenticated === true;
  });
}

async function exchangeCredential(credential: string): Promise<void> {
  await retryTransient(async () => {
    const response = await fetch("/api/auth/browser-session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    if (response.status === 401) {
      throw new AuthRequestError(
        "That pairing link is invalid or was already used. Mint a fresh one.",
        401,
      );
    }
    if (!response.ok) {
      throw new AuthRequestError(`Pairing failed (${response.status}).`, response.status);
    }
  });
  // The cookie is set by the response, but give the server a moment to report it.
  const startedAt = Date.now();
  while (!(await fetchSessionAuthenticated())) {
    if (Date.now() - startedAt >= SESSION_ESTABLISH_TIMEOUT_MS) {
      throw new Error("Paired, but the session did not become active. Try again.");
    }
    await sleep(100);
  }
}

function takePairingTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = getPairingTokenFromUrl(url);
  if (token === null) return null;
  window.history.replaceState({}, document.title, stripPairingTokenFromUrl(url).toString());
  return token;
}

/** Resolves the auth gate once at boot, consuming a `#token=` pairing credential if present. */
export async function resolveAuthGate(): Promise<AuthGateState> {
  const urlCredential = takePairingTokenFromUrl();
  try {
    if (urlCredential === null) {
      return (await fetchSessionAuthenticated())
        ? { status: "authenticated" }
        : { status: "requires-auth" };
    }
    await exchangeCredential(urlCredential);
    return { status: "authenticated" };
  } catch (error) {
    return {
      status: "requires-auth",
      errorMessage: error instanceof Error ? error.message : "Authentication failed.",
    };
  }
}

/** Pairs this browser from a pasted pairing URL or raw credential. */
export async function submitPairingCredential(input: string): Promise<void> {
  const trimmed = input.trim();
  if (trimmed === "") throw new Error("Paste a pairing link or code.");
  let credential = trimmed;
  try {
    credential = getPairingTokenFromUrl(new URL(trimmed)) ?? trimmed;
  } catch {
    // Not a URL; treat the input as the raw credential.
  }
  await exchangeCredential(credential);
}
