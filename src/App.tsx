import { useCallback, useEffect, useRef, useState } from "react";
import { ControlBar } from "@/features/control/ControlBar";
import { HelpPopover } from "@/features/control/HelpPopover";
import { StatusBar } from "@/features/debug/StatusBar";
import { DebugPanel } from "@/features/debug/DebugPanel";
import { TerminalPanel } from "@/features/terminal/TerminalPanel";
import { RvdbTerminalPanel } from "@/features/terminal/RvdbTerminalPanel";
import { useEmulatorStore } from "@/features/emulator/useEmulatorStore";

export default function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const shortcutButtonRef = useRef<HTMLButtonElement | null>(null);
  const mode = useEmulatorStore((s) => s.mode);

  const restoreShortcutFocus = useCallback((): void => {
    requestAnimationFrame(() => shortcutButtonRef.current?.focus());
  }, []);

  const closeHelp = useCallback((): void => {
    setHelpOpen(false);
    restoreShortcutFocus();
  }, [restoreShortcutFocus]);

  // Keyboard shortcuts: Space=Run/Pause, S=Step, R=Reset, ?=Help, Esc=close.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHelpOpen((open) => {
          if (open) restoreShortcutFocus();
          return false;
        });
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((open) => {
          if (open) restoreShortcutFocus();
          return !open;
        });
        return;
      }
      // Bail when focus is inside the terminal canvas (let xterm own its keystrokes)
      // or in a form field / button (let the native control handle the key).
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".terminal-container")) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      // Don't hijack browser/system modifiers (Cmd+R should reload, not Reset).
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const s = useEmulatorStore.getState();
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (s.status === "running") s.pause();
        else if (s.status === "ready") s.run();
      } else if (e.key === "s" || e.key === "S") {
        if (s.status === "ready") s.step();
      } else if (e.key === "r" || e.key === "R") {
        if (s.status !== "idle" && s.status !== "loading") s.reset();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [restoreShortcutFocus]);

  // Free WASM heap on page unload to avoid residue across refresh-mid-run.
  useEffect(() => {
    const onBeforeUnload = () => {
      const emu = useEmulatorStore.getState().emulator;
      if (!emu) return;
      const maybeDisposable = emu as unknown as { free?: () => void };
      if (typeof maybeDisposable.free === "function") {
        maybeDisposable.free();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <ControlBar />
      <main
        className={`main-grid${mode === "debug" ? " main-grid-debug" : ""}`}
        id="main"
      >
        <DebugPanel />
        <TerminalPanel />
        {mode === "debug" ? <RvdbTerminalPanel /> : null}
      </main>
      <StatusBar
        helpOpen={helpOpen}
        onOpenHelp={() => setHelpOpen(true)}
        shortcutButtonRef={shortcutButtonRef}
      />
      {helpOpen ? <HelpPopover onClose={closeHelp} /> : null}
    </div>
  );
}
