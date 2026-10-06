import { RegistryContext, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import {
  type AtomCommand,
  type AtomCommandResult,
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useCallback, useContext } from "react";

/** Binds a runtime command to the app registry. Resolves to Success or Failure, never throws. */
export function useAtomCommand<A, E, W>(
  command: AtomCommand<W, A, E>,
): (value: W) => Promise<AtomCommandResult<A, E>> {
  const registry = useContext(RegistryContext);
  return useCallback(
    (value: W) =>
      runAtomCommand(registry, command, value, {
        label: command.label,
        reportFailure: true,
        reportDefect: true,
      }),
    [command, registry],
  );
}

/** A user-presentable message for a failed command, or null when it was interrupted. */
export function commandFailureMessage<A, E>(result: AtomCommandResult<A, E>): string | null {
  if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "Something went wrong.";
}

const EMPTY_ASYNC_RESULT_ATOM = Atom.make(AsyncResult.initial<never, never>(false)).pipe(
  Atom.withLabel("glass-query:empty"),
);

export interface QueryView<A> {
  readonly data: A | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
}

/** Reads an environment query atom (or nothing) as plain data, error and pending flags. */
export function useEnvironmentQuery<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>> | null,
): QueryView<A> {
  const selected = atom ?? EMPTY_ASYNC_RESULT_ATOM;
  const result = useAtomValue(selected);
  const refresh = useAtomRefresh(selected);
  let error: string | null = null;
  if (result._tag === "Failure") {
    const squashed = Cause.squash(result.cause);
    error =
      squashed instanceof Error && squashed.message.trim() !== ""
        ? squashed.message
        : "The request failed.";
  }
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error,
    isPending: atom !== null && result.waiting,
    refresh,
  };
}
