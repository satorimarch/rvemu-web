import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useEmulatorStore } from "@/features/emulator/useEmulatorStore";
import { XTERM_THEME, XTERM_FONT_FAMILY, shouldBlinkTerminalCursor } from "./theme";

/**
 * The rvdb debugger REPL terminal — the second hero surface alongside the UART
 * terminal. Active only in Debug mode: user keystrokes are pushed to the rvdb
 * noline editor via pushReplInput; REPL output (prompt, echo, command results,
 * disassembly, etc.) streams back through rvdbText.
 *
 * Mounted in Debug mode alongside UART so debugger commands and program output
 * remain visible at the same time.
 */
export function RvdbTerminalPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const disposeTimerRef = useRef<number | null>(null);
  const writtenRef = useRef(0);
  const lastEpochRef = useRef(0);

  const mode = useEmulatorStore((s) => s.mode);
  const rvdbText = useEmulatorStore((s) => s.rvdbText);
  const rvdbEpoch = useEmulatorStore((s) => s.rvdbEpoch);
  const pushReplInput = useEmulatorStore((s) => s.pushReplInput);

  // Keep a ref to mode + pushReplInput so the onData closure (attached once on
  // mount) always sees the latest values without re-subscribing.
  const modeRef = useRef(mode);
  const pushRef = useRef(pushReplInput);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    pushRef.current = pushReplInput;
  }, [pushReplInput]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (disposeTimerRef.current !== null) {
      window.clearTimeout(disposeTimerRef.current);
      disposeTimerRef.current = null;
    }

    let term = termRef.current;
    let fit = fitRef.current;
    if (!term || !fit) {
      term = new Terminal({
        fontSize: 13,
        fontFamily: XTERM_FONT_FAMILY,
        cursorBlink: shouldBlinkTerminalCursor(),
        convertEol: true,
        scrollback: 5000,
        theme: XTERM_THEME,
        disableStdin: false
      });

      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);
      fit.fit();

      // RVDB mounts only after Debug mode is active. Its first visible text
      // comes exclusively from the real REPL stream.
      writtenRef.current = 0;
      lastEpochRef.current = 0;
      termRef.current = term;
      fitRef.current = fit;
    }

    const disposable = term.onData((data) => {
      if (modeRef.current !== "debug") return;
      pushRef.current(data);
    });
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // Ignore transient fit failures during teardown.
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      disposable.dispose();
      const terminalToDispose = term;
      disposeTimerRef.current = window.setTimeout(() => {
        if (termRef.current !== terminalToDispose) return;
        terminalToDispose.dispose();
        termRef.current = null;
        fitRef.current = null;
        disposeTimerRef.current = null;
      }, 0);
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // Epoch change (mode switch, fresh Load, Reset, or clamp slice): full resync.
    if (rvdbEpoch !== lastEpochRef.current) {
      term.reset();
      writtenRef.current = 0;
      lastEpochRef.current = rvdbEpoch;
      if (rvdbText.length === 0) return;
      term.write(rvdbText);
      writtenRef.current = rvdbText.length;
      return;
    }

    // Normal incremental write path.
    if (rvdbText.length === 0) return;
    const start = writtenRef.current;
    if (start >= rvdbText.length) return;
    if (start < 0 || start > rvdbText.length) {
      term.reset();
      term.write(rvdbText);
      writtenRef.current = rvdbText.length;
      return;
    }
    term.write(rvdbText.slice(start));
    writtenRef.current = rvdbText.length;
  }, [rvdbText, rvdbEpoch]);

  // Tail of the buffer for the aria-live mirror.
  const mirrorText = rvdbText.length > 4000 ? `…${rvdbText.slice(-4000)}` : rvdbText;

  return (
    <section className="panel terminal-panel rvdb-terminal-panel" aria-label="RVDB debugger terminal">
      <header className="panel-header">
        <h2>RVDB</h2>
      </header>
      <div className="terminal-container" aria-hidden="true" ref={containerRef} />
      <div className="uart-mirror" role="status" aria-live="polite" aria-atomic="false">
        {mirrorText}
      </div>
    </section>
  );
}
