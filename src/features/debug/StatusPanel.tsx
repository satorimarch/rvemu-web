import { useMemo } from "react";
import { EmulatorStatus, useEmulatorStore } from "@/features/emulator/useEmulatorStore";

function hex(value: bigint, width = 16): string {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

export function StatusPanel() {
  const { pc, cycles, regs, executionState, error } = useEmulatorStore();

  const regRows = useMemo(() => {
    return regs.map((value, index) => ({ name: `x${index.toString().padStart(2, "0")}`, value }));
  }, [regs]);

  return (
    <section className="panel debug-panel">
      <header className="panel-title">Status</header>
      <div className="stats-grid">
        <div>
          <span className="label">PC</span>
          <span className="value">{hex(pc)}</span>
        </div>
        <div>
          <span className="label">Cycles</span>
          <span className="value">{cycles.toString()}</span>
        </div>
        <div>
          <span className="label">Execution</span>
          <span className="value">
            {executionState === EmulatorStatus.Running ? "Running" : "Paused"}
          </span>
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="register-grid">
        {regRows.map((reg) => (
          <div key={reg.name} className="register-item">
            <span className="reg-name">{reg.name}</span>
            <span className="reg-value">{hex(reg.value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
