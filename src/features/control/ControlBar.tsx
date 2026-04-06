import { ChangeEvent, useEffect, useState } from "react";
import { EmulatorStatus, useEmulatorStore } from "@/features/emulator/useEmulatorStore";

type ProgramFormat = "elf" | "bin";

type BuiltInProgram = {
  id: string;
  file: string;
};

export function ControlBar() {
  const [format, setFormat] = useState<ProgramFormat>("elf");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingLoad, setPendingLoad] = useState(false);
  const [builtInPrograms, setBuiltInPrograms] = useState<BuiltInProgram[]>([]);
  const [selectedBuiltIn, setSelectedBuiltIn] = useState<string>("");
  const [hasBuiltIns, setHasBuiltIns] = useState(false);

  const {
    loadProgram,
    loadProgramFromUrl,
    loading,
    executionState,
    startRun,
    pauseRun,
    stepOnce,
    clearUart,
    emulator
  } = useEmulatorStore();

  useEffect(() => {
    fetch("/test-programs/manifest.json")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setBuiltInPrograms(data.programs || []);
        setHasBuiltIns(data.programs.length > 0);
      })
      .catch(() => {
        setHasBuiltIns(false);
      });
  }, []);

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

  const onLoadBuiltIn = async () => {
    if (!selectedBuiltIn) return;
    await loadProgramFromUrl(`/test-programs/${selectedBuiltIn}`, "elf");
    setSelectedBuiltIn("");
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

      {hasBuiltIns && (
        <div className="control-row">
          <label>Built-in Programs:</label>
          <select 
            value={selectedBuiltIn} 
            onChange={(e) => setSelectedBuiltIn(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Select a program --</option>
            {builtInPrograms.map(p => (
              <option key={p.id} value={p.file}>{p.id}</option>
            ))}
          </select>
          <button onClick={onLoadBuiltIn} disabled={!selectedBuiltIn || loading}>
            Load
          </button>
        </div>
      )}

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
