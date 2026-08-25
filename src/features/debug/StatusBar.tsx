import type { RefObject } from "react";
import { useEmulatorStore } from "@/features/emulator/useEmulatorStore";
import { hex, dec } from "./format";

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  idle: { label: "Idle", className: "status-idle" },
  loading: { label: "Loading", className: "status-loading" },
  ready: { label: "Ready", className: "status-ready" },
  running: { label: "Running", className: "status-running" },
  halted: { label: "Halted", className: "status-halted" },
  error: { label: "Error", className: "status-error" }
};

const WRAPPER_REPO = "https://github.com/here-emulator/here-web";

interface StatusBarProps {
  helpOpen: boolean;
  onOpenHelp: () => void;
  shortcutButtonRef: RefObject<HTMLButtonElement>;
}

export function StatusBar({ helpOpen, onOpenHelp, shortcutButtonRef }: StatusBarProps) {
  const status = useEmulatorStore((s) => s.status);
  const pc = useEmulatorStore((s) => s.pc);
  const cycles = useEmulatorStore((s) => s.cycles);
  const meta = STATUS_META[status] ?? { label: status, className: "status-idle" };

  return (
    <footer className="status-bar" aria-label="Emulator status">
      <div className="status-brand">
        <span className="brand-text">HERE Emulator</span>
      </div>
      <div className="status-stats">
        <span className="stat">
          <span className="stat-key">PC</span>
          <span className="stat-val">{hex(pc)}</span>
        </span>
        <span className="stat">
          <span className="stat-key">Cycles</span>
          <span className="stat-val">{dec(cycles)}</span>
        </span>
        <span
          className={`stat-pill ${meta.className}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {meta.label}
        </span>
      </div>
      <div className="status-actions">
        <button
          type="button"
          className="shortcut-button"
          onClick={onOpenHelp}
          ref={shortcutButtonRef}
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          aria-keyshortcuts="?"
        >
          Shortcuts <kbd aria-hidden="true">?</kbd>
        </button>
        <a
          className="repo-link"
          href={WRAPPER_REPO}
          target="_blank"
          rel="noreferrer"
        >
          HERE Web ↗
        </a>
      </div>
    </footer>
  );
}
