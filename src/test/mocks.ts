import { vi } from "vitest";
import type { WasmEmulator } from "@/features/emulator/wasmTypes";

// Mock WASM module for testing
export const createMockEmulator = (overrides?: Partial<WasmEmulator>): WasmEmulator => ({
  step: vi.fn(),
  continue_for_steps: vi.fn(),
  read_reg: vi.fn((i: number) => BigInt(i * 10)),
  read_pc: vi.fn(() => 0x80000000n),
  clock_cycles: vi.fn(() => 100n),
  take_uart_output: vi.fn(() => new Uint8Array()),
  push_uart_input: vi.fn(),
  is_halted: vi.fn(() => false),
  free: vi.fn(),
  ...overrides
}) as WasmEmulator;

export const createMockWasmModule = (emulator?: WasmEmulator) => ({
  WasmEmulator: {
    from_elf_bytes: vi.fn(() => emulator ?? createMockEmulator()),
    from_bin_bytes: vi.fn(() => emulator ?? createMockEmulator())
  }
});

export const mockLoadWasmModule = vi.fn();
