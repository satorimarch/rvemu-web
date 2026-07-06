import { useMemo } from "react";
import { useEmulatorStore } from "@/features/emulator/useEmulatorStore";
import { REG_ABI_NAMES } from "@/features/emulator/registers";
import { hex } from "./format";

export function DebugPanel() {
  const regs = useEmulatorStore((s) => s.regs);
  const status = useEmulatorStore((s) => s.status);

  const rows = useMemo(
    () => regs.map((value, i) => ({ abi: REG_ABI_NAMES[i], idx: i, value })),
    [regs]
  );

  // Loading skeleton: 32 muted placeholder rectangles instead of all-zero regs.
  // No animation (Calm Precision / No-Glow). Tells the user "registers are about
  // to arrive" rather than showing stale prior state as if it were ground truth.
  if (status === "loading") {
    return (
      <section
        className="panel debug-panel"
        aria-label="RISC-V integer registers"
        aria-busy="true"
      >
        <header className="panel-header">
          <h2>Registers</h2>
        </header>
        <div
          className="register-grid"
          role="list"
          aria-label="Loading registers"
        >
          {Array.from({ length: 32 }).map((_, i) => (
            <div className="register-item" key={i} role="listitem">
              <span className="reg-name">{REG_ABI_NAMES[i]}</span>
              <span className="reg-value-skeleton" aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel debug-panel" aria-label="RISC-V integer registers">
      <header className="panel-header">
        <h2>Registers</h2>
      </header>
      <div
        className="register-grid"
        role="list"
        aria-label="Integer registers x0 through x31"
      >
        {rows.map(({ abi, idx, value }) => (
          <div className="register-item" key={idx} role="listitem">
            <span className="reg-name" aria-label={`${abi}, register x${idx}`}>{abi}</span>
            <span className="reg-value">{hex(value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
