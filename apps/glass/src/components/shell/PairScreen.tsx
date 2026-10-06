import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { submitPairingCredential } from "~/connection/auth";
import { Button } from "~/components/ui/Button";

/**
 * Shown when the server this page is served from has not paired this browser.
 * Accepts a full pairing URL (any host:port of the same server) or a bare code.
 */
export function PairScreen({
  initialError,
  onPaired,
}: {
  readonly initialError: string | null;
  readonly onPaired: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await submitPairingCredential(value);
      onPaired();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pairing failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative grid h-full place-items-center overflow-hidden">
      <div className="wallpaper" aria-hidden />
      <form
        onSubmit={submit}
        className="glass animate-dialog-in relative w-[min(26rem,calc(100vw-2rem))] rounded-3xl border border-line-strong p-7 shadow-pop"
      >
        <div className="mb-5 grid size-10 place-items-center rounded-xl bg-hover">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">Pair this browser</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Paste the pairing link your T3 server printed on startup, or mint one with{" "}
          <code className="rounded bg-code px-1 font-mono text-xs">t3 pair</code>. Links for the
          same server work here even if they point at a different port.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="http://localhost:5733/pair#token=…"
          className="mt-5 h-10 w-full rounded-xl border border-line-strong bg-sunken/60 px-3 font-mono text-xs outline-none placeholder:text-faint focus:border-accent"
        />
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending || value.trim() === ""}
          className="mt-5 w-full justify-center"
        >
          {pending ? "Pairing…" : "Pair"}
        </Button>
      </form>
    </div>
  );
}
