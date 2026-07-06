import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import {
  useEmulatorStore,
  SPEED_PRESETS,
  type SpeedPreset,
  type ProgramFormat,
  type RunStatus
} from "@/features/emulator/useEmulatorStore";
import { hex } from "@/features/debug/format";

type BuiltInProgram = {
  id: string;
  file: string;
  format?: ProgramFormat;
};

/** True when a fresh selection is staged but not yet loaded. */
function isPendingSelection(
  status: RunStatus,
  selectedFile: File | null,
  selectedBuiltIn: string
): boolean {
  if (status === "loading") return false;
  return selectedFile !== null || selectedBuiltIn !== "";
}

export function ControlBar() {
  const [format, setFormat] = useState<ProgramFormat>("elf");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [builtIns, setBuiltIns] = useState<BuiltInProgram[]>([]);
  const [selectedBuiltIn, setSelectedBuiltIn] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const baseUrl = `${import.meta.env.BASE_URL}test-programs`;

  const status = useEmulatorStore((s) => s.status);
  const mode = useEmulatorStore((s) => s.mode);
  const debugRunning = useEmulatorStore((s) => s.debugRunning);
  const speed = useEmulatorStore((s) => s.speed);
  const error = useEmulatorStore((s) => s.error);
  const haltPc = useEmulatorStore((s) => s.haltPc);
  const loadFile = useEmulatorStore((s) => s.loadFile);
  const loadFromUrl = useEmulatorStore((s) => s.loadFromUrl);
  const run = useEmulatorStore((s) => s.run);
  const pause = useEmulatorStore((s) => s.pause);
  const step = useEmulatorStore((s) => s.step);
  const reset = useEmulatorStore((s) => s.reset);
  const setSpeed = useEmulatorStore((s) => s.setSpeed);
  const enterDebugMode = useEmulatorStore((s) => s.enterDebugMode);
  const exitDebugMode = useEmulatorStore((s) => s.exitDebugMode);

  useEffect(() => {
    fetch(`${baseUrl}/manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setBuiltIns(Array.isArray(data.programs) ? data.programs : []))
      .catch(() => setBuiltIns([]));
  }, [baseUrl]);

  const isLoading = status === "loading";
  const hasProgram = status !== "idle" && status !== "loading";
  const isRunning = status === "running";
  const inDebug = mode === "debug";
  // Step is blocked on Halted (machine is done) AND on Error (the emulator is in a
  // faulting state — pressing Step would silently re-execute the faulting instruction).
  const canStep = hasProgram && !isRunning && status !== "halted" && status !== "error";
  // While a selection is staged but not loaded, the prior loaded program (if any)
  // is stale — block run/pause/step until Load commits.
  const pending = isPendingSelection(status, selectedFile, selectedBuiltIn);
  // Run-mode controls are inert in debug mode — execution is driven by the REPL.
  const runLocked = !hasProgram || pending || status === "halted" || inDebug;
  const stepLocked = !canStep || pending || inDebug;
  const resetLocked = !hasProgram || pending;
  // Debug toggle: can enter debug when a program is loaded and not running;
  // can exit debug unless a continue is running.
  const debugToggleLocked = inDebug
    ? debugRunning
    : !hasProgram || isRunning || isLoading || pending;

  // CTA elevation: exactly one button carries .btn-primary at any moment, matching
  // the user's "what do I do next" mental primary. Idle → Load; Ready → Run;
  // Running → Pause; Halted/Error → Reset. Load demotes to default once a program
  // is loaded so two CTAs never compete for the eye.
  const loadPrimary = status === "idle";
  const runPrimary = status === "ready" && !inDebug;
  const pausePrimary = status === "running" && !inDebug;
  const resetPrimary = status === "halted" || status === "error";

  const clearSelection = (): void => {
    setSelectedFile(null);
    setSelectedBuiltIn("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const applyFile = (file: File): void => {
    setSelectedFile(file);
    setSelectedBuiltIn("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    const name = file.name.toLowerCase();
    if (name.endsWith(".bin")) setFormat("bin");
    else if (name.endsWith(".elf")) setFormat("elf");
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    if (file) applyFile(file);
  };

  const onDragOver = (e: DragEvent<HTMLLabelElement>): void => {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  };

  const onDragLeave = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault();
    setDragOver(false);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) applyFile(file);
  };

  const onBuiltInChange = (value: string): void => {
    setSelectedBuiltIn(value);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (value) {
      const p = builtIns.find((p) => p.file === value);
      setFormat(p?.format ?? "elf");
    }
  };

  const onLoad = async (): Promise<void> => {
    if (isLoading) return;
    if (selectedFile) {
      await loadFile(selectedFile, format);
    } else if (selectedBuiltIn) {
      const p = builtIns.find((p) => p.file === selectedBuiltIn);
      await loadFromUrl(`${baseUrl}/${selectedBuiltIn}`, p?.format ?? "elf");
    } else {
      return;
    }
    clearSelection();
  };

  // State, not narration: just name what's selected. The Load button is one row below.
  const pendingLabel = selectedFile
    ? `Selected: ${selectedFile.name}`
    : selectedBuiltIn
      ? `Selected: ${selectedBuiltIn.replace(/\.elf$/, "")}`
      : "";

  const idleHint = hasProgram ? null : (
    <span className="hint-text">Load a program to begin.</span>
  );

  return (
    <section className="panel control-bar" aria-label="Emulator controls">
      <div className="control-row control-load">
        <span className="field-label" id="program-label">Program</span>
        <label
          className={`file-input-wrap${dragOver ? " dragover" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={onFileChange}
            aria-labelledby="program-label"
            aria-label="Choose ELF or binary program file"
          />
          <span className="file-input-button">
            {selectedFile ? selectedFile.name : "Choose file…"}
          </span>
        </label>
        {builtIns.length > 0 && (
          <select
            className="builtin-select"
            value={selectedBuiltIn}
            onChange={(e) => onBuiltInChange(e.target.value)}
            disabled={isLoading}
            aria-label="Built-in program"
          >
            <option value="">Built-in…</option>
            {builtIns.map((p) => (
              <option key={p.id} value={p.file}>{p.id}</option>
            ))}
          </select>
        )}
        {(selectedFile || selectedBuiltIn) && (
          <select
            className="format-select"
            value={format}
            onChange={(e) => setFormat(e.target.value as ProgramFormat)}
            aria-label="Program format"
          >
            <option value="elf">ELF</option>
            <option value="bin">BIN</option>
          </select>
        )}
        <button
          className={`btn${loadPrimary ? " btn-primary" : ""}`}
          onClick={onLoad}
          disabled={isLoading || (!selectedFile && !selectedBuiltIn)}
        >
          {isLoading ? "Loading…" : "Load"}
        </button>
      </div>

      <div className="control-row control-run">
        <button
          className={`btn${runPrimary ? " btn-primary" : ""}`}
          onClick={run}
          disabled={runLocked || isRunning}
          title="Run (Space)"
          aria-keyshortcuts="Space"
        >
          Run
        </button>
        <button
          className={`btn${pausePrimary ? " btn-primary" : ""}`}
          onClick={pause}
          disabled={!isRunning || inDebug}
          title="Pause (Space)"
          aria-keyshortcuts="Space"
        >
          Pause
        </button>
        <button
          className="btn"
          onClick={step}
          disabled={stepLocked}
          title="Step one instruction (S)"
          aria-keyshortcuts="S"
        >
          Step
        </button>
        <button
          className={`btn${resetPrimary ? " btn-primary" : ""}`}
          onClick={reset}
          disabled={resetLocked}
          title="Reset (R)"
          aria-keyshortcuts="R"
        >
          Reset
        </button>
        <span className="control-divider" aria-hidden="true" />
        <button
          className={`btn${inDebug ? " btn-primary" : ""}`}
          onClick={() => (inDebug ? exitDebugMode() : enterDebugMode())}
          disabled={debugToggleLocked}
          aria-label={inDebug ? "Exit debug mode and return to run mode" : "Enter debug mode"}
          title={
            inDebug && debugToggleLocked
              ? "An RVDB command is running; wait for it to halt before exiting Debug mode"
              : inDebug
                ? "Exit Debug mode"
                : "Enter Debug mode"
          }
        >
          {inDebug ? "Exit Debug" : "Enter Debug"}
        </button>
        {inDebug && debugToggleLocked ? (
          <span className="mode-hint" role="status">
            RVDB command running — Debug mode is locked.
          </span>
        ) : null}
        <div className="speed-control">
          <label className="field-label" htmlFor="speed">Speed</label>
          <select
            id="speed"
            value={speed}
            onChange={(e) => setSpeed(e.target.value as SpeedPreset)}
            disabled={isRunning || inDebug}
            aria-label="Execution speed"
          >
            {(Object.keys(SPEED_PRESETS) as SpeedPreset[]).map((k) => (
              <option key={k} value={k}>{SPEED_PRESETS[k].label}</option>
            ))}
          </select>
        </div>
        {idleHint}
      </div>

      {pending ? (
        <div className="hint-box pending-hint">
          <span className="hint-message">{pendingLabel}</span>
        </div>
      ) : null}
      {error ? (
        <div className="hint-box error-hint" role="alert">
          <span className="hint-message">{error}</span>
          <button
            type="button"
            className="btn hint-action"
            onClick={reset}
            disabled={resetLocked}
            aria-label="Reset to retry the loaded program"
          >
            Reset to retry
          </button>
        </div>
      ) : null}
      {status === "halted" && haltPc !== null ? (
        <div className="hint-box halted-hint" role="status">
          <span className="hint-message">
            Program powered off at PC {hex(haltPc)}.
          </span>
          <button
            type="button"
            className="btn hint-action"
            onClick={reset}
            disabled={resetLocked}
            aria-label="Reset to restart the program from its initial state"
          >
            Reset
          </button>
        </div>
      ) : null}
    </section>
  );
}
