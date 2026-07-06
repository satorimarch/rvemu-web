import { create } from "zustand";
import { loadWasmModule } from "./wasmLoader";
import type { WasmEmulator, WasmRvdb, WasmRvdbHandle, REPLResponse } from "./wasmTypes";
import { REG_COUNT } from "./registers";

export type ProgramFormat = "elf" | "bin";

export type RunStatus = "idle" | "loading" | "ready" | "running" | "halted" | "error";

export type EmulatorMode = "run" | "debug";

const MAX_UART_TEXT_LENGTH = 1_000_000;
const MAX_RVDB_TEXT_LENGTH = 1_000_000;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/** Module-level internal state for the rvdb tick chain + drain loop. These are
 *  not reactive — the UI reads `mode`, `debugRunning`, `rvdbText` etc. from the
 *  store; these vars drive the machinery behind those values. */
let rvdbDrainId: number | null = null;
let rvdbExitRequestedGeneration: number | null = null;
let rvdbSessionGeneration = 0;
/** Guard: prevents the tick chain from forking if startRvdbTickChain is called
 *  while a chain is already running. */
let rvdbTickGeneration: number | null = null;

function defaultRegs(): bigint[] {
  return Array.from({ length: REG_COUNT }, () => 0n);
}

function disposeEmulator(emulator: WasmEmulator | null): void {
  if (!emulator) return;
  const maybeDisposable = emulator as unknown as { free?: () => void };
  if (typeof maybeDisposable.free === "function") {
    maybeDisposable.free();
  }
}

function disposeRvdb(rvdb: WasmRvdb | null): void {
  if (!rvdb) return;
  const maybeDisposable = rvdb as unknown as { free?: () => void };
  if (typeof maybeDisposable.free === "function") {
    maybeDisposable.free();
  }
}

function disposeRvdbHandle(handle: WasmRvdbHandle | null): void {
  if (!handle) return;
  const maybeDisposable = handle as unknown as { free?: () => void };
  if (typeof maybeDisposable.free === "function") {
    maybeDisposable.free();
  }
}

function cleanupRetiredRvdb(
  rvdb: WasmRvdb | null,
  handle: WasmRvdbHandle | null,
  generation: number
): void {
  if (rvdbTickGeneration === generation) {
    rvdbTickGeneration = null;
  }
  disposeRvdbHandle(handle);
  disposeRvdb(rvdb);
}

function retireRvdbSession(
  rvdb: WasmRvdb | null,
  handle: WasmRvdbHandle | null,
  generation: number
): void {
  rvdbExitRequestedGeneration = null;
  rvdbSessionGeneration += 1;

  if (handle) {
    try {
      handle.cancel_continue();
      handle.push_repl_input(textEncoder.encode("\n"));
    } catch {
      // Best effort: if the handle is already invalid, stale tick cleanup below
      // or page unload will reclaim what can be reclaimed.
    }
  }

  if (rvdbTickGeneration === generation) return;
  cleanupRetiredRvdb(rvdb, handle, generation);
}

function readRegisters(emulator: WasmEmulator): bigint[] {
  const regs: bigint[] = [];
  for (let i = 0; i < REG_COUNT; i += 1) {
    regs.push(emulator.read_reg(i));
  }
  return regs;
}

/** Slice the front when the buffer exceeds the cap. Returns the (possibly sliced)
 *  text and whether slicing happened so callers can bump the epoch. */
function clampUart(text: string): { text: string; sliced: boolean } {
  if (text.length > MAX_UART_TEXT_LENGTH) {
    return { text: text.slice(-MAX_UART_TEXT_LENGTH), sliced: true };
  }
  return { text, sliced: false };
}

function clampRvdb(text: string): { text: string; sliced: boolean } {
  if (text.length > MAX_RVDB_TEXT_LENGTH) {
    return { text: text.slice(-MAX_RVDB_TEXT_LENGTH), sliced: true };
  }
  return { text, sliced: false };
}

export type SpeedPreset = "slow" | "normal" | "fast" | "turbo";

export const SPEED_PRESETS: Record<SpeedPreset, { label: string; stepsPerFrame: bigint }> = {
  slow: { label: "Slow", stepsPerFrame: 50n },
  normal: { label: "Normal", stepsPerFrame: 10_000n },
  fast: { label: "Fast", stepsPerFrame: 200_000n },
  turbo: { label: "Turbo", stepsPerFrame: 10_000_000n }
};

export type EmulatorState = {
  status: RunStatus;
  mode: EmulatorMode;
  emulator: WasmEmulator | null;
  rvdb: WasmRvdb | null;
  rvdbHandle: WasmRvdbHandle | null;
  error: string | null;
  pc: bigint;
  cycles: bigint;
  regs: bigint[];
  uartText: string;
  /** Increments whenever uartText is reconstructed (Reset, fresh Load, or 1M clamp slice).
   *  The terminal component watches this to know when to do a full reset+rewrite
   *  instead of an incremental append, preventing cursor/desync bugs. */
  uartEpoch: number;
  rvdbText: string;
  /** Increments whenever rvdbText is reconstructed (mode switch, fresh Load, Reset,
   *  or clamp slice). The RVDB terminal watches this for full reset+rewrite. */
  rvdbEpoch: number;
  /** True while a rvdb `continue` command is actively executing. Drives the
   *  exit-debug-mode button disabled state. */
  debugRunning: boolean;
  /** PC at which the emulator halted, or null when not halted. Surfaces into the
   *  halted-hint diagnostic; WASM API exposes halt state only, not cause. */
  haltPc: bigint | null;
  /** Cached bytes + format of the most-recently-successfully-loaded program. Reset
   *  re-instantiates from this so it acts as "restart from initial state" (debugger
   *  semantic) rather than "eject program." Stays null until the first successful
   *  load; updated on each successful load. Never mutated in place. */
  lastLoadedBytes: { bytes: Uint8Array; format: ProgramFormat } | null;
  speed: SpeedPreset;
  animationFrameId: number | null;

  loadBytes: (format: ProgramFormat, readBytes: () => Promise<Uint8Array>) => Promise<void>;
  loadFile: (file: File, format: ProgramFormat) => Promise<void>;
  loadFromUrl: (url: string, format: ProgramFormat) => Promise<void>;
  step: () => void;
  run: () => void;
  pause: () => void;
  reset: () => Promise<void>;
  setSpeed: (speed: SpeedPreset) => void;
  pushUartInput: (text: string) => void;
  pushReplInput: (text: string) => void;
  enterDebugMode: () => Promise<void>;
  exitDebugMode: () => void;
  refresh: () => void;
};

export const useEmulatorStore = create<EmulatorState>((set, get) => {
  /* ---- rvdb internal machinery (closures over set/get) ---- */

  /** Stops the drain rAF loop if one is active. */
  function stopRvdbDrainLoop(): void {
    if (rvdbDrainId !== null) {
      window.cancelAnimationFrame(rvdbDrainId);
      rvdbDrainId = null;
    }
  }

  /** Drains pending REPL + UART output from the rvdb channel, updates machine
   *  state (PC, cycles, regs), and reads `debugRunning` from the WASM handle. Called
   *  every animation frame while in debug mode — independently of the tick chain,
   *  so live program output during a `continue` streams to the terminals. */
  function drainRvdbFrame(): void {
    const { rvdbHandle, mode } = get();
    if (!rvdbHandle || mode !== "debug") {
      rvdbDrainId = null;
      return;
    }

    // REPL output (echo, command results, disassembly, etc.)
    const replOut = rvdbHandle.take_repl_output();
    // UART output (program stdout during a continue)
    const uartOut = rvdbHandle.take_uart_output();

    // Read machine state from the shared rvdb snapshot. Rust marks
    // continue_running across yielded chunks, so the UI does not flicker when
    // the PC happens not to change on one animation frame.
    const pc = rvdbHandle.read_pc();
    const cycles = rvdbHandle.clock_cycles();
    const regs = Array.from(rvdbHandle.read_regs());
    const halted = rvdbHandle.is_halted();
    const running = rvdbHandle.is_continue_running() && !halted;
    set((s) => {
      const nextUart = uartOut.length > 0
        ? clampUart(s.uartText + textDecoder.decode(uartOut))
        : { text: s.uartText, sliced: false };
      const nextRepl = replOut.length > 0
        ? clampRvdb(s.rvdbText + textDecoder.decode(replOut))
        : { text: s.rvdbText, sliced: false };
      return {
        uartText: nextUart.text,
        uartEpoch: nextUart.sliced ? s.uartEpoch + 1 : s.uartEpoch,
        rvdbText: nextRepl.text,
        rvdbEpoch: nextRepl.sliced ? s.rvdbEpoch + 1 : s.rvdbEpoch,
        pc,
        cycles,
        regs,
        debugRunning: running,
        status: halted ? "halted" : running ? "running" : "ready",
        haltPc: halted ? pc : null
      };
    });

    rvdbDrainId = window.requestAnimationFrame(drainRvdbFrame);
  }

  function startRvdbDrainLoop(): void {
    stopRvdbDrainLoop();
    rvdbDrainId = window.requestAnimationFrame(drainRvdbFrame);
  }

  /** Converts the rvdb back to a WasmEmulator and returns to run mode. Called
   *  from the tick chain after a pending readline is resolved with an empty line
   *  (exitDebugMode pushes "\n" to break the readline wait). */
  function finishExitDebugMode(
    generation: number,
    rvdb: WasmRvdb,
    rvdbHandle: WasmRvdbHandle | null
  ): void {
    if (generation !== rvdbSessionGeneration || get().rvdb !== rvdb) {
      cleanupRetiredRvdb(rvdb, rvdbHandle, generation);
      return;
    }

    stopRvdbDrainLoop();

    // Final drain so no output is lost on the switch.
    const replOut = rvdbHandle ? rvdbHandle.take_repl_output() : new Uint8Array();
    const uartOut = rvdbHandle ? rvdbHandle.take_uart_output() : new Uint8Array();
    set((s) => {
      const nextUart = uartOut.length > 0
        ? clampUart(s.uartText + textDecoder.decode(uartOut))
        : { text: s.uartText, sliced: false };
      const nextRepl = replOut.length > 0
        ? clampRvdb(s.rvdbText + textDecoder.decode(replOut))
        : { text: s.rvdbText, sliced: false };
      return {
        uartText: nextUart.text,
        uartEpoch: nextUart.sliced ? s.uartEpoch + 1 : s.uartEpoch,
        rvdbText: nextRepl.text,
        rvdbEpoch: nextRepl.sliced ? s.rvdbEpoch + 1 : s.rvdbEpoch
      };
    });

    const emulator = rvdb.into_emulator();
    disposeRvdbHandle(rvdbHandle);
    rvdbExitRequestedGeneration = null;
    if (rvdbTickGeneration === generation) {
      rvdbTickGeneration = null;
    }

    set({
      mode: "run",
      rvdb: null,
      rvdbHandle: null,
      emulator,
      debugRunning: false,
      status: emulator.is_halted() ? "halted" : "ready",
      haltPc: emulator.is_halted() ? emulator.read_pc() : null
    });
    get().refresh();
  }

  /** Starts (or continues) the tick chain: calls rvdb.tick(), and on resolution
   *  drains output, handles exit/quit, and chains the next tick. The chain stays
   *  pending while the noline editor waits for a full line (user typing) or while
   *  a `continue` runs in stepped chunks. */
  function startRvdbTickChain(): void {
    const { rvdb, rvdbHandle } = get();
    const generation = rvdbSessionGeneration;
    if (!rvdb || rvdbTickGeneration === generation) return;
    rvdbTickGeneration = generation;

    rvdb.tick()
      .then((response: REPLResponse) => {
        if (generation !== rvdbSessionGeneration || get().rvdb !== rvdb) {
          cleanupRetiredRvdb(rvdb, rvdbHandle, generation);
          return;
        }
        if (rvdbTickGeneration === generation) {
          rvdbTickGeneration = null;
        }

        // Drain immediately so command output appears without waiting for rAF.
        const replOut = rvdbHandle ? rvdbHandle.take_repl_output() : new Uint8Array();
        const uartOut = rvdbHandle ? rvdbHandle.take_uart_output() : new Uint8Array();
        set((s) => {
          const nextUart = uartOut.length > 0
            ? clampUart(s.uartText + textDecoder.decode(uartOut))
            : { text: s.uartText, sliced: false };
          const nextRepl = replOut.length > 0
            ? clampRvdb(s.rvdbText + textDecoder.decode(replOut))
            : { text: s.rvdbText, sliced: false };
          return {
            uartText: nextUart.text,
            uartEpoch: nextUart.sliced ? s.uartEpoch + 1 : s.uartEpoch,
            rvdbText: nextRepl.text,
            rvdbEpoch: nextRepl.sliced ? s.rvdbEpoch + 1 : s.rvdbEpoch
          };
        });

        // User typed quit/exit, or user clicked the Run toggle (exitRequested).
        if (response.exit || rvdbExitRequestedGeneration === generation) {
          finishExitDebugMode(generation, rvdb, rvdbHandle);
          return;
        }

        // Chain the next tick (waits for the next command line).
        startRvdbTickChain();
      })
      .catch((error: unknown) => {
        if (generation !== rvdbSessionGeneration || get().rvdb !== rvdb) {
          cleanupRetiredRvdb(rvdb, rvdbHandle, generation);
          return;
        }
        if (rvdbTickGeneration === generation) {
          rvdbTickGeneration = null;
        }
        const msg = error instanceof Error ? error.message : String(error);
        set((s) => ({
          rvdbText: s.rvdbText + `\r\n[rvdb error] ${msg}\r\n`,
          rvdbEpoch: s.rvdbEpoch
        }));

        if (rvdbExitRequestedGeneration === generation) {
          finishExitDebugMode(generation, rvdb, rvdbHandle);
          return;
        }

        // Continue the chain even after an error (a bad command shouldn't kill
        // the REPL).
        startRvdbTickChain();
      });
  }

  /* ---- store state + actions ---- */

  return {
    status: "idle",
    mode: "run",
    emulator: null,
    rvdb: null,
    rvdbHandle: null,
    error: null,
    pc: 0n,
    cycles: 0n,
    regs: defaultRegs(),
    uartText: "",
    uartEpoch: 0,
    rvdbText: "",
    rvdbEpoch: 0,
    debugRunning: false,
    haltPc: null,
    lastLoadedBytes: null,
    speed: "normal",
    animationFrameId: null,

    loadBytes: async (format, readBytes) => {
      if (get().status === "loading") return;

      const prev = get();
      if (prev.animationFrameId !== null) {
        window.cancelAnimationFrame(prev.animationFrameId);
      }
      // If currently in debug mode, tear down the rvdb machinery first.
      if (prev.mode === "debug") {
        stopRvdbDrainLoop();
        retireRvdbSession(prev.rvdb, prev.rvdbHandle, rvdbSessionGeneration);
      }

      // Bump uartEpoch + rvdbEpoch so terminals reset their canvases on this load.
      set({
        status: "loading",
        mode: "run",
        emulator: null,
        rvdb: null,
        rvdbHandle: null,
        error: null,
        pc: 0n,
        cycles: 0n,
        regs: defaultRegs(),
        uartText: "",
        uartEpoch: prev.uartEpoch + 1,
        rvdbText: "",
        rvdbEpoch: prev.rvdbEpoch + 1,
        debugRunning: false,
        haltPc: null,
        animationFrameId: null
      });

      try {
        const bytes = await readBytes();
        const wasm = await loadWasmModule();
        const next =
          format === "elf"
            ? wasm.WasmEmulator.from_elf_bytes(bytes)
            : wasm.WasmEmulator.from_bin_bytes(bytes);

        disposeEmulator(prev.emulator);

        const halted = next.is_halted();
        set({
          emulator: next,
          status: halted ? "halted" : "ready",
          error: null,
          haltPc: halted ? next.read_pc() : null,
          lastLoadedBytes: { bytes, format }
        });
        get().refresh();
      } catch (error) {
        disposeEmulator(prev.emulator);
        set({
          status: "error",
          emulator: null,
          error: error instanceof Error ? error.message : String(error),
          haltPc: null
        });
      }
    },

    loadFile: (file, format) =>
      get().loadBytes(format, async () => new Uint8Array(await file.arrayBuffer())),

    loadFromUrl: (url, format) =>
      get().loadBytes(format, async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch program: ${response.status} ${response.statusText}`);
        }
        return new Uint8Array(await response.arrayBuffer());
      }),

    step: () => {
      const { emulator, mode } = get();
      if (!emulator || mode !== "run") return;

      try {
        emulator.step();
        const out = emulator.take_uart_output();
        const append = out.length > 0 ? textDecoder.decode(out) : "";
        const halted = emulator.is_halted();

        set((s) => {
          const next = append ? clampUart(s.uartText + append) : { text: s.uartText, sliced: false };
          return {
            uartText: next.text,
            uartEpoch: next.sliced ? s.uartEpoch + 1 : s.uartEpoch,
            status: halted ? "halted" : "ready",
            haltPc: halted ? emulator.read_pc() : null
          };
        });
        get().refresh();
      } catch (error) {
        set({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          animationFrameId: null
        });
      }
    },

    run: () => {
      const { emulator, status, mode } = get();
      if (!emulator || mode !== "run" || status === "running" || status === "halted") return;

      const stepsPerFrame = SPEED_PRESETS[get().speed].stepsPerFrame;

      const tick = () => {
        const state = get();
        if (state.status !== "running" || !state.emulator || state.mode !== "run") return;

        try {
          state.emulator.continue_for_steps(stepsPerFrame);
          const out = state.emulator.take_uart_output();
          const append = out.length > 0 ? textDecoder.decode(out) : "";
          const halted = state.emulator.is_halted();
          const emu = state.emulator;

          set((s) => {
            const next = append ? clampUart(s.uartText + append) : { text: s.uartText, sliced: false };
            return {
              uartText: next.text,
              uartEpoch: next.sliced ? s.uartEpoch + 1 : s.uartEpoch,
              cycles: emu.clock_cycles(),
              pc: emu.read_pc(),
              status: halted ? "halted" : "running",
              haltPc: halted ? emu.read_pc() : null
            };
          });

          if (halted) {
            set({ animationFrameId: null });
            get().refresh();
            return;
          }

          set({ animationFrameId: window.requestAnimationFrame(tick) });
        } catch (error) {
          set({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            animationFrameId: null
          });
          get().refresh();
        }
      };

      set({ status: "running", error: null });
      set({ animationFrameId: window.requestAnimationFrame(tick) });
    },

    pause: () => {
      const { animationFrameId, mode } = get();
      if (mode !== "run") return;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      set({ status: "ready", animationFrameId: null });
      get().refresh();
    },

    reset: async () => {
      const prev = get();
      if (prev.animationFrameId !== null) {
        window.cancelAnimationFrame(prev.animationFrameId);
      }

      // Tear down debug mode if active — Reset always returns to run mode.
      if (prev.mode === "debug") {
        stopRvdbDrainLoop();
        retireRvdbSession(prev.rvdb, prev.rvdbHandle, rvdbSessionGeneration);
      }
      disposeEmulator(prev.emulator);

      if (prev.lastLoadedBytes) {
        try {
          const wasm = await loadWasmModule();
          const next =
            prev.lastLoadedBytes.format === "elf"
              ? wasm.WasmEmulator.from_elf_bytes(prev.lastLoadedBytes.bytes)
              : wasm.WasmEmulator.from_bin_bytes(prev.lastLoadedBytes.bytes);
          const halted = next.is_halted();
          set({
            status: halted ? "halted" : "ready",
            mode: "run",
            emulator: next,
            rvdb: null,
            rvdbHandle: null,
            error: null,
            pc: 0n,
            cycles: 0n,
            regs: defaultRegs(),
            uartText: "",
            uartEpoch: prev.uartEpoch + 1,
            rvdbText: "",
            rvdbEpoch: prev.rvdbEpoch + 1,
            debugRunning: false,
            haltPc: halted ? next.read_pc() : null,
            animationFrameId: null
          });
          get().refresh();
        } catch (error) {
          set({
            status: "error",
            mode: "run",
            emulator: null,
            rvdb: null,
            rvdbHandle: null,
            error: error instanceof Error ? error.message : String(error),
            haltPc: null,
            animationFrameId: null
          });
        }
        return;
      }

      set({
        status: "idle",
        mode: "run",
        rvdb: null,
        rvdbHandle: null,
        error: null,
        pc: 0n,
        cycles: 0n,
        regs: defaultRegs(),
        uartText: "",
        uartEpoch: prev.uartEpoch + 1,
        rvdbText: "",
        rvdbEpoch: prev.rvdbEpoch + 1,
        debugRunning: false,
        haltPc: null,
        animationFrameId: null
      });
    },

    setSpeed: (speed) => set({ speed }),

    pushUartInput: (text) => {
      const { emulator, rvdbHandle, mode } = get();
      if (mode === "debug" && rvdbHandle) {
        if (text.length === 0) return;
        rvdbHandle.push_uart_input(textEncoder.encode(text));
        return;
      }
      if (!emulator || text.length === 0) return;
      emulator.push_uart_input(textEncoder.encode(text));
    },

    pushReplInput: (text) => {
      const { rvdbHandle, mode } = get();
      if (mode !== "debug" || !rvdbHandle || text.length === 0) return;
      rvdbHandle.push_repl_input(textEncoder.encode(text));
    },

    enterDebugMode: async () => {
      const { emulator, status, mode, animationFrameId } = get();
      if (mode !== "run" || !emulator) return;
      if (status === "running" || status === "loading") return;

      // Stop the run-mode animation loop.
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      try {
        const rvdb = await emulator.into_rvdb();
        // emulator is consumed (moved into rvdb). Null it out. The board-state
        // + channel methods live on the handle in the refactored wasm API.
        const handle = rvdb.handle();
        rvdbSessionGeneration += 1;
        rvdbExitRequestedGeneration = null;
        if (rvdbTickGeneration === rvdbSessionGeneration) {
          rvdbTickGeneration = null;
        }

        const halted = handle.is_halted();
        set({
          mode: "debug",
          emulator: null,
          rvdb,
          rvdbHandle: handle,
          rvdbText: "",
          rvdbEpoch: get().rvdbEpoch + 1,
          debugRunning: false,
          status: halted ? "halted" : "ready",
          haltPc: halted ? handle.read_pc() : null,
          animationFrameId: null
        });
        get().refresh();

        startRvdbTickChain();
        startRvdbDrainLoop();
      } catch (error) {
        // into_rvdb failed — the emulator may still be valid if the error was
        // before the move. Best-effort: keep the emulator, surface the error.
        set({
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    exitDebugMode: () => {
      const { rvdb, rvdbHandle, mode, debugRunning } = get();
      if (mode !== "debug" || !rvdb) return;
      // Exit keeps the current machine state, so it waits for continue to stop.
      if (debugRunning) return;

      // Signal the tick chain to stop after the next resolution, then push a
      // newline to break the pending readline (submits an empty line = no-op).
      rvdbExitRequestedGeneration = rvdbSessionGeneration;
      try {
        rvdbHandle?.push_repl_input(textEncoder.encode("\n"));
      } catch {
        // If push fails, the tick chain will still see exitRequested on its
        // next resolution; finishExitDebugMode will run then.
      }
    },

    refresh: () => {
      const { emulator, rvdbHandle, mode } = get();
      if (mode === "debug" && rvdbHandle) {
        set({
          pc: rvdbHandle.read_pc(),
          cycles: rvdbHandle.clock_cycles(),
          regs: Array.from(rvdbHandle.read_regs())
        });
        return;
      }
      if (!emulator) return;
      set({
        pc: emulator.read_pc(),
        cycles: emulator.clock_cycles(),
        regs: readRegisters(emulator)
      });
    }
  };
});
