import { create } from "zustand";
import { loadWasmModule } from "./wasmLoader";
import type { WasmEmulator } from "./wasmTypes";

type ProgramFormat = "elf" | "bin";

export enum EmulatorStatus {
  Running = "Running",
  Paused = "Paused"
}

const REG_COUNT = 32;

function readRegisters(emulator: WasmEmulator): bigint[] {
  const regs: bigint[] = [];
  for (let i = 0; i < REG_COUNT; i += 1) {
    regs.push(emulator.read_reg(i));
  }
  return regs;
}

type EmulatorState = {
  emulator: WasmEmulator | null;
  loading: boolean;
  executionState: EmulatorStatus;
  boardHalted: boolean;
  error: string | null;
  cycles: bigint;
  pc: bigint;
  regs: bigint[];
  uartText: string;
  stepBudgetPerFrame: bigint;
  animationFrameId: number | null;
  loadProgram: (file: File, format: ProgramFormat) => Promise<void>;
  loadProgramFromUrl: (url: string, format: ProgramFormat) => Promise<void>;
  stepOnce: () => Promise<void>;
  startRun: () => void;
  pauseRun: () => void;
  pushUartInput: (text: string) => void;
  refreshDebug: () => void;
  clearUart: () => void;
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const useEmulatorStore = create<EmulatorState>((set, get) => ({
  emulator: null,
  loading: false,
  executionState: EmulatorStatus.Paused,
  boardHalted: false,
  error: null,
  cycles: 0n,
  pc: 0n,
  regs: Array.from({ length: REG_COUNT }, () => 0n),
  uartText: "",
  stepBudgetPerFrame: 100_000n,
  animationFrameId: null,

  loadProgram: async (file, format) => {
    const { animationFrameId } = get();
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
    }

    set({
      loading: true,
      emulator: null,
      error: null,
      executionState: EmulatorStatus.Paused,
      boardHalted: false,
      animationFrameId: null,
      uartText: "",
      pc: 0n,
      cycles: 0n,
      regs: Array.from({ length: REG_COUNT }, () => 0n)
    });

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const wasm = await loadWasmModule();
      const emulator =
        format === "elf"
          ? wasm.WasmEmulator.from_elf_bytes(bytes)
          : wasm.WasmEmulator.from_bin_bytes(bytes);

      set({
        emulator,
        loading: false,
        executionState: EmulatorStatus.Paused,
        boardHalted: emulator.is_halted()
      });
      get().refreshDebug();
    } catch (error) {
      set({
        loading: false,
        executionState: EmulatorStatus.Paused,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  loadProgramFromUrl: async (url, format) => {
    const { animationFrameId } = get();
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
    }

    set({
      loading: true,
      emulator: null,
      error: null,
      executionState: EmulatorStatus.Paused,
      boardHalted: false,
      animationFrameId: null,
      uartText: "",
      pc: 0n,
      cycles: 0n,
      regs: Array.from({ length: REG_COUNT }, () => 0n)
    });

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch program: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const wasm = await loadWasmModule();
      const emulator =
        format === "elf"
          ? wasm.WasmEmulator.from_elf_bytes(bytes)
          : wasm.WasmEmulator.from_bin_bytes(bytes);

      set({
        emulator,
        loading: false,
        executionState: EmulatorStatus.Paused,
        boardHalted: emulator.is_halted()
      });
      get().refreshDebug();
    } catch (error) {
      set({
        loading: false,
        executionState: EmulatorStatus.Paused,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  stepOnce: async () => {
    const { emulator } = get();
    if (!emulator) return;

    if (emulator.is_halted()) {
      set({ error: "Board is halted. Please reload ELF/BIN before running again." });
      get().refreshDebug();
      return;
    }

    try {
      emulator.step();
      const out = emulator.take_uart_output();
      set((state) => ({
        uartText: state.uartText + textDecoder.decode(out),
        boardHalted: emulator.is_halted()
      }));
      get().refreshDebug();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        executionState: EmulatorStatus.Paused,
        animationFrameId: null,
        boardHalted: emulator.is_halted()
      });
    }
  },

  startRun: () => {
    const { emulator, executionState } = get();
    if (!emulator || executionState === EmulatorStatus.Running) return;

    if (emulator.is_halted()) {
      set({ error: "Board is halted. Please reload ELF/BIN before running again." });
      get().refreshDebug();
      return;
    }

    const tick = () => {
      const state = get();
      if (state.executionState !== EmulatorStatus.Running || !state.emulator) return;

      try {
        state.emulator.continue_for_steps(state.stepBudgetPerFrame);
        const out = state.emulator.take_uart_output();
        const append = out.length > 0 ? textDecoder.decode(out) : "";
        const boardHalted = state.emulator.is_halted();

        set((s) => ({
          uartText: append ? s.uartText + append : s.uartText,
          cycles: state.emulator!.clock_cycles(),
          pc: state.emulator!.read_pc(),
          boardHalted
        }));

        if (boardHalted) {
          set({ executionState: EmulatorStatus.Paused, animationFrameId: null });
          get().refreshDebug();
          return;
        }

        const next = window.requestAnimationFrame(tick);
        set({ animationFrameId: next });
      } catch (error) {
        set({
          executionState: EmulatorStatus.Paused,
          animationFrameId: null,
          boardHalted: state.emulator.is_halted(),
          error: error instanceof Error ? error.message : String(error)
        });
        get().refreshDebug();
      }
    };

    set({ executionState: EmulatorStatus.Running, error: null });
    const handle = window.requestAnimationFrame(tick);
    set({ animationFrameId: handle });
  },

  pauseRun: () => {
    const { animationFrameId, emulator } = get();
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
    }
    set({
      executionState: EmulatorStatus.Paused,
      animationFrameId: null,
      boardHalted: emulator ? emulator.is_halted() : false
    });
    get().refreshDebug();
  },

  pushUartInput: (text) => {
    const { emulator } = get();
    if (!emulator || text.length === 0) return;
    emulator.push_uart_input(textEncoder.encode(text));
  },

  refreshDebug: () => {
    const { emulator } = get();
    if (!emulator) return;

    set({
      pc: emulator.read_pc(),
      cycles: emulator.clock_cycles(),
      regs: readRegisters(emulator)
    });
  },

  clearUart: () => set({ uartText: "" })
}));
