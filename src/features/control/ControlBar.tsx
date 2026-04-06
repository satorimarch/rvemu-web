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
    setSelectedBuiltIn(""); // Clear built-in selection
    const name = file?.name.toLowerCase() ?? "";
    if (name.endsWith(".bin")) {
      setFormat("bin");
    } else if (name.endsWith(".elf")) {
      setFormat("elf");
    }
  };

  const onBuiltInChange = (value: string) => {
    setSelectedBuiltIn(value);
    setSelectedFile(null); // Clear file selection
    if (value) {
      setFormat("elf"); // Built-in programs are always ELF
    }
  };

  const onLoad = async () => {
    if (selectedFile) {
      await loadProgram(selectedFile, format);
    } else if (selectedBuiltIn) {
      await loadProgramFromUrl(`/test-programs/${selectedBuiltIn}`, "elf");
    }
  };

  const hasSelection = selectedFile !== null || selectedBuiltIn !== "";
  const actionLocked = loading || !emulator;

  return (
    <section className="control-bar panel">
      <div className="control-row">
        <input type="file" onChange={onFileChange} value="" />
        <select value={format} onChange={(e) => setFormat(e.target.value as ProgramFormat)}>
          <option value="elf">ELF</option>
          <option value="bin">BIN</option>
        </select>
      </div>

      {hasBuiltIns && (
        <div className="control-row">
          <label>Built-in Programs:</label>
          <select 
            value={selectedBuiltIn} 
            onChange={(e) => onBuiltInChange(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Select a program --</option>
            {builtInPrograms.map(p => (
              <option key={p.id} value={p.file}>{p.id}</option>
            ))}
          </select>
        </div>
      )}

      <div className="control-row">
        <button onClick={onLoad} disabled={!hasSelection || loading}>
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

      {hasSelection && !loading && !emulator ? (
        <div className="hint">
          {selectedFile ? `Selected: ${selectedFile.name}` : `Selected: ${selectedBuiltIn.replace('.elf', '')}`}. Click Load to start.
        </div>
      ) : null}
    </section>
  );
}
