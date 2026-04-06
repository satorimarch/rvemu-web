import { ChangeEvent, useEffect, useRef, useState } from "react";
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const testProgramsBaseUrl = `${import.meta.env.BASE_URL}test-programs`;

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
    fetch(`${testProgramsBaseUrl}/manifest.json`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setBuiltInPrograms(data.programs || []);
        setHasBuiltIns(data.programs.length > 0);
      })
      .catch(() => {
        setHasBuiltIns(false);
      });
  }, [testProgramsBaseUrl]);

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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (value) {
      setFormat("elf"); // Built-in programs are always ELF
    }
  };

  const onLoad = async () => {
    if (loading) {
      return;
    }

    if (selectedFile) {
      await loadProgram(selectedFile, format);
    } else if (selectedBuiltIn) {
      await loadProgramFromUrl(`${testProgramsBaseUrl}/${selectedBuiltIn}`, "elf");
    } else {
      return;
    }

    setSelectedFile(null);
    setSelectedBuiltIn("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const hasSelection = selectedFile !== null || selectedBuiltIn !== "";
  const actionLocked = loading || !emulator;

  return (
    <section className="control-bar panel">
      <div className="control-row">
        <input ref={fileInputRef} type="file" onChange={onFileChange} />
        <select value={format} onChange={(e) => setFormat(e.target.value as ProgramFormat)}>
          <option value="elf">ELF</option>
          <option value="bin">BIN</option>
        </select>
        <button onClick={onLoad} disabled={!hasSelection || loading}>
          {loading ? "Loading..." : "Load"}
        </button>
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

      {hasSelection && !loading ? (
        <div className="hint">
          {selectedFile ? `Selected: ${selectedFile.name}` : `Selected: ${selectedBuiltIn.replace('.elf', '')}`}. Click Load to start.
        </div>
      ) : null}
    </section>
  );
}
