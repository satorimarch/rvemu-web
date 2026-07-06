/**
 * Keyboard-shortcut help popover. Mounted by App.tsx, toggled by `?`, dismissed by Escape.
 * Pure presentational component; visibility state is owned by the parent.
 * Focuses its Close button on mount so keyboard users land inside the dialog.
 */

import { useEffect, useRef } from "react";

const SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "Space", action: "Run / Pause" },
  { keys: "S", action: "Step one instruction" },
  { keys: "R", action: "Reset emulator" },
  { keys: "?", action: "Toggle this help" },
  { keys: "Esc", action: "Close help / popovers" }
];

export function HelpPopover({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="help-popover"
      role="dialog"
      aria-label="Keyboard shortcuts"
      aria-modal="false"
    >
      <h3>Keyboard shortcuts</h3>
      <dl>
        {SHORTCUTS.map((s) => (
          <div key={s.keys} style={{ display: "contents" }}>
            <dt>
              <kbd>{s.keys}</kbd>
            </dt>
            <dd>{s.action}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="btn help-popover-close"
        onClick={onClose}
        ref={closeRef}
        aria-label="Close keyboard shortcuts help"
      >
        Close
      </button>
    </div>
  );
}
