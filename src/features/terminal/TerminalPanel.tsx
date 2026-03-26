import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { useEmulatorStore } from "@/features/emulator/useEmulatorStore";

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const writtenLengthRef = useRef(0);
  const uartText = useEmulatorStore((s) => s.uartText);
  const pushUartInput = useEmulatorStore((s) => s.pushUartInput);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontSize: 14,
      cursorBlink: true,
      convertEol: true,
      theme: {
        background: "#101820",
        foreground: "#f4f1de",
        cursor: "#ff6b35"
      }
    });

    term.open(containerRef.current);
    term.writeln("RVEmu Web Terminal Ready.");
    term.writeln("Load ELF/BIN and press Run.");
    writtenLengthRef.current = 0;

    const disposable = term.onData((data) => {
      pushUartInput(data);
    });

    termRef.current = term;

    return () => {
      disposable.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, [pushUartInput]);

  useEffect(() => {
    if (!termRef.current) return;

    if (uartText.length < writtenLengthRef.current) {
      // Store text was cleared or reset; clear terminal buffer and restart offset.
      termRef.current.clear();
      writtenLengthRef.current = 0;
    }

    if (uartText.length === 0) return;
    const start = writtenLengthRef.current;
    if (start >= uartText.length) return;
    const chunk = uartText.slice(start);
    termRef.current.write(chunk);
    writtenLengthRef.current = uartText.length;
  }, [uartText]);

  return (
    <section className="panel terminal-panel">
      <header className="panel-title">UART</header>
      <div ref={containerRef} className="terminal-container" />
    </section>
  );
}
