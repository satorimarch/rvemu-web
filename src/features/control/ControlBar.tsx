import { ChangeEvent, useState } from "react";
import { EmulatorStatus, useEmulatorStore } from "@/features/emulator/useEmulatorStore";

type ProgramFormat = "elf" | "bin";

export function ControlBar() {
  const [format, setFormat] = useState<ProgramFormat>("elf");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingLoad, setPendingLoad] = useState(false);

  const {
    loadProgram,
    loading,
    executionState,
    startRun,
    pauseRun,
    stepOnce,
    clearUart,
    emulator
  } = useEmulatorStore();

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPendingLoad(file !== null);
    const name = file?.name.toLowerCase() ?? "";
    if (name.endsWith(".bin")) {
      setFormat("bin");
    } else if (name.endsWith(".elf")) {
      setFormat("elf");
    }
  };

  const onLoad = async () => {
    if (!selectedFile) return;
    await loadProgram(selectedFile, format);
    if (useEmulatorStore.getState().emulator) {
      setPendingLoad(false);
    }
  };

  const actionLocked = loading || !emulator || pendingLoad;

  return (
    <section className="control-bar panel">
      <div className="control-row">
        <input type="file" onChange={onFileChange} />
        <select value={format} onChange={(e) => setFormat(e.target.value as ProgramFormat)}>
          <option value="elf">ELF</option>
          <option value="bin">BIN</option>
        </select>
        <button onClick={onLoad} disabled={!selectedFile || loading}>
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      <div className="control-row">
        <button
          onClick={startRun}
          disabled={actionLocked || executionState === EmulatorStatus.Running}
        >
          Run
        </button>
        <button onClick={pauseRun} disabled={executionState !== EmulatorStatus.Running}>
          Pause
        </button>
        <button
          onClick={() => void stepOnce()}
          disabled={actionLocked || executionState === EmulatorStatus.Running}
        >
          Step
        </button>
        <button onClick={clearUart} disabled={actionLocked}>
          Clear UART
        </button>
      </div>

      {pendingLoad ? <div className="hint">A new file is selected. Click Load to apply it.</div> : null}
    </section>
  );
}
