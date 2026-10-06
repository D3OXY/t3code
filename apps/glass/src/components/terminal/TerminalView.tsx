import "@xterm/xterm/css/xterm.css";

import {
  INITIAL_TERMINAL_OUTPUT_CURSOR,
  readTerminalOutputUpdate,
  type TerminalBufferState,
} from "@t3tools/client-runtime/state/terminal";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { RotateCcw } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";

import { Button } from "~/components/ui/Button";
import { isMac } from "~/lib/format";
import { matchesShortcut, SHORTCUTS, tabIndexShortcut } from "~/lib/shortcuts";
import { terminalEnvironment } from "~/state/atoms";
import { commandFailureMessage, useAtomCommand, useEnvironmentQuery } from "~/state/hooks";
import { readTerminalFontFamily, readTerminalTheme } from "./terminalTheme";

const INPUT_COALESCE_MS = 12;
const MAX_WRITE_CHARS = 65_536;
const RESIZE_DEBOUNCE_MS = 80;

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// App shortcuts pass through the terminal to the window. Off macOS "mod" is
// Ctrl, which shells need (Ctrl+K, Ctrl+B…), so only non-mod ones pass there.
const PASSTHROUGH_SHORTCUTS = Object.values(SHORTCUTS).filter(
  (spec) => isMac || !spec.startsWith("mod+"),
);

/**
 * One attached terminal session rendered with xterm. Mount it keyed by
 * terminal id: unmounting detaches (the shell keeps running on the server),
 * only an explicit close ends it.
 */
export function TerminalView({
  environmentId,
  threadId,
  terminalId,
  cwd,
  worktreePath,
  exitCode,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly terminalId: string;
  readonly cwd: string;
  readonly worktreePath: string | null;
  /** From the server's terminal metadata; may lag the exit event slightly. */
  readonly exitCode: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const cursorRef = useRef(INITIAL_TERMINAL_OUTPUT_CURSOR);
  const statusRef = useRef<TerminalBufferState["status"]>("closed");
  const attach = useEnvironmentQuery(
    terminalEnvironment.attach({
      environmentId,
      input: { threadId, terminalId, cwd, worktreePath },
    }),
  );
  const runWrite = useAtomCommand(terminalEnvironment.write);
  const runResize = useAtomCommand(terminalEnvironment.resize);
  const runRestart = useAtomCommand(terminalEnvironment.restart);
  const session = attach.data;

  const readSession = useEffectEvent(() => session);
  const readExitCode = useEffectEvent(() => exitCode);
  const writeInput = useEffectEvent(async (data: string) => {
    const result = await runWrite({ environmentId, input: { threadId, terminalId, data } });
    const message = commandFailureMessage(result);
    if (message) terminalRef.current?.write(`\r\n${DIM}[terminal] ${message}${RESET}\r\n`);
  });
  const sendResize = useEffectEvent((cols: number, rows: number) => {
    void runResize({ environmentId, input: { threadId, terminalId, cols, rows } });
  });

  // Applies a session state to the screen: new output, then lifecycle notes.
  const render = useEffectEvent((terminal: Terminal, next: TerminalBufferState | null) => {
    if (next === null) return;
    const update = readTerminalOutputUpdate(next.output, cursorRef.current);
    if (update.type === "reset") {
      terminal.reset();
      terminal.write(update.data);
    } else if (update.type === "append") {
      terminal.write(update.data);
    }
    cursorRef.current = update.cursor;
    const previous = statusRef.current;
    if (next.status === "exited" && previous !== "exited") {
      const code = readExitCode();
      terminal.write(`\r\n${DIM}[process exited${code === null ? "" : ` ${code}`}]${RESET}\r\n`);
    } else if (next.status === "error" && next.error && previous !== "error") {
      terminal.write(`\r\n${DIM}[terminal] ${next.error}${RESET}\r\n`);
    }
    statusRef.current = next.status;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const terminal = new Terminal({
      allowTransparency: true,
      theme: readTerminalTheme(),
      fontFamily: readTerminalFontFamily(),
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: false,
      cursorStyle: "bar",
      cursorInactiveStyle: "outline",
      scrollback: 5_000,
      drawBoldTextInBrightColors: false,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminalRef.current = terminal;
    // A fresh screen replays the session from the start (effects re-run under StrictMode).
    cursorRef.current = INITIAL_TERMINAL_OUTPUT_CURSOR;
    statusRef.current = "closed";

    const fitToContainer = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      fit.fit();
    };
    fitToContainer();
    render(terminal, readSession());
    sendResize(terminal.cols, terminal.rows);
    terminal.focus();

    terminal.attachCustomKeyEventHandler(
      (event) =>
        event.type !== "keydown" ||
        (tabIndexShortcut(event) === null &&
          !PASSTHROUGH_SHORTCUTS.some((spec) => matchesShortcut(event, spec))),
    );

    // Keystrokes are batched briefly and sent in order, split under the
    // server's per-write limit (large pastes arrive as one onData call).
    let pending = "";
    let flushTimer: number | undefined;
    let queue = Promise.resolve();
    const flush = () => {
      flushTimer = undefined;
      let data = pending;
      pending = "";
      while (data.length > 0) {
        let end = Math.min(MAX_WRITE_CHARS, data.length);
        // Don't split a surrogate pair across writes.
        if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1] ?? "")) end -= 1;
        const chunk = data.slice(0, end);
        data = data.slice(end);
        queue = queue.then(() => writeInput(chunk));
      }
    };
    const onData = terminal.onData((data) => {
      pending += data;
      flushTimer ??= window.setTimeout(flush, INPUT_COALESCE_MS);
    });

    let resizeTimer: number | undefined;
    const onResize = terminal.onResize(({ cols, rows }) => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => sendResize(cols, rows), RESIZE_DEBOUNCE_MS);
    });

    let frame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        fitToContainer();
      });
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = readTerminalTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      if (flushTimer !== undefined) {
        window.clearTimeout(flushTimer);
        flush();
      }
      window.clearTimeout(resizeTimer);
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      onData.dispose();
      onResize.dispose();
      terminalRef.current = null;
      // xterm 5.5 defers viewport syncs (a timeout in open(), a frame in
      // reset()) that throw once disposed. StrictMode and quick thread
      // switches unmount before they run, so dispose after both.
      window.requestAnimationFrame(() => window.setTimeout(() => terminal.dispose()));
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) render(terminal, session);
  }, [session]);

  const exited = session?.status === "exited";
  const restart = async () => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const result = await runRestart({
      environmentId,
      input: { threadId, terminalId, cwd, worktreePath, cols: terminal.cols, rows: terminal.rows },
    });
    const message = commandFailureMessage(result);
    if (message) terminal.write(`\r\n${DIM}[terminal] ${message}${RESET}\r\n`);
    else terminal.focus();
  };

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* FitAddon measures the parent of xterm's element, so padding lives outside it. */}
      <div className="min-h-0 min-w-0 flex-1 py-1.5 pl-3">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      {attach.error !== null && session === null ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-[12.5px] text-danger">
          {attach.error}
        </div>
      ) : null}
      {exited ? (
        <div className="glass-pop animate-fade-quick absolute right-3 bottom-3 flex items-center gap-2 rounded-xl py-1 pr-1 pl-3 text-[12px] text-muted">
          Process exited{exitCode === null ? "" : ` with code ${exitCode}`}
          <Button size="xs" variant="secondary" onClick={() => void restart()}>
            <RotateCcw className="size-3" />
            Restart
          </Button>
        </div>
      ) : null}
    </div>
  );
}
