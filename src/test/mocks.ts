import { vi, type Mock } from "vitest";

/**
 * A mock WasmEmulator, including the optional `free` that the generated wasm
 * package exposes (consumed duck-typed by the store) but that `WasmEmulator`
 * in wasmTypes intentionally omits.
 *
 * Each method is a vitest Mock so tests can configure return values.
 */
export type MockEmulator = {
  step: Mock;
  continue_for_steps: Mock;
  into_rvdb: Mock;
  read_reg: Mock;
  read_regs: Mock;
  read_pc: Mock;
  clock_cycles: Mock;
  take_uart_output: Mock;
  push_uart_input: Mock;
  is_halted: Mock;
  free: Mock;
};

/** Creates a mock WasmEmulator with sensible defaults; overrides apply on top. */
export function createMockEmulator(overrides?: Partial<MockEmulator>): MockEmulator {
  return {
    step: vi.fn(),
    continue_for_steps: vi.fn(),
    into_rvdb: vi.fn(),
    read_reg: vi.fn((i: number): bigint => BigInt(i * 10)),
    read_regs: vi.fn((): BigUint64Array => new BigUint64Array(32)),
    read_pc: vi.fn((): bigint => 0x80000000n),
    clock_cycles: vi.fn((): bigint => 100n),
    take_uart_output: vi.fn((): Uint8Array => new Uint8Array()),
    push_uart_input: vi.fn(),
    is_halted: vi.fn((): boolean => false),
    free: vi.fn(),
    ...overrides
  };
}

export type MockWasmModule = {
  default: Mock;
  WasmEmulator: {
    from_elf_bytes: Mock;
    from_bin_bytes: Mock;
  };
  WasmRvdb?: {
    from_elf_bytes: Mock;
    from_bin_bytes: Mock;
  };
};

/** Creates a mock WasmModule. If `rvdb` is supplied, WasmRvdb factories are added. */
export function createMockWasmModule(emulator?: MockEmulator, rvdb?: MockRvdb): MockWasmModule {
  const emu = emulator ?? createMockEmulator();
  const mod: MockWasmModule = {
    default: vi.fn((): Promise<void> => Promise.resolve()),
    WasmEmulator: {
      from_elf_bytes: vi.fn((): MockEmulator => emu),
      from_bin_bytes: vi.fn((): MockEmulator => emu)
    }
  };
  if (rvdb) {
    mod.WasmRvdb = {
      from_elf_bytes: vi.fn((): Promise<MockRvdb> => Promise.resolve(rvdb)),
      from_bin_bytes: vi.fn((): Promise<MockRvdb> => Promise.resolve(rvdb))
    };
  }
  return mod;
}

export type MockRvdb = {
  tick: Mock;
  into_emulator: Mock;
  handle: Mock;
  free: Mock;
};

export type MockRvdbHandle = {
  is_halted: Mock;
  is_continue_running: Mock;
  clock_cycles: Mock;
  read_pc: Mock;
  read_reg: Mock;
  read_regs: Mock;
  cancel_continue: Mock;
  push_repl_input: Mock;
  take_repl_output: Mock;
  push_uart_input: Mock;
  take_uart_output: Mock;
  load_symbol_file: Mock;
  free: Mock;
};

/** Creates a mock WasmRvdbHandle with sensible defaults; overrides apply on top. */
export function createMockRvdbHandle(
  overrides?: Partial<MockRvdbHandle>
): MockRvdbHandle {
  return {
    is_halted: vi.fn((): boolean => false),
    is_continue_running: vi.fn((): boolean => false),
    clock_cycles: vi.fn((): bigint => 100n),
    read_pc: vi.fn((): bigint => 0x80000000n),
    read_reg: vi.fn((i: number): bigint => BigInt(i * 10)),
    read_regs: vi.fn((): BigUint64Array => new BigUint64Array(32)),
    cancel_continue: vi.fn(),
    push_repl_input: vi.fn(),
    take_repl_output: vi.fn((): Uint8Array => new Uint8Array()),
    push_uart_input: vi.fn(),
    take_uart_output: vi.fn((): Uint8Array => new Uint8Array()),
    load_symbol_file: vi.fn(),
    free: vi.fn(),
    ...overrides
  };
}

/** Creates a mock WasmRvdb. `tick` resolves to {exit:false, cancel:false} by default.
 *  The returned object's `handle()` yields the given (or a fresh) handle. */
export function createMockRvdb(
  overrides?: Partial<MockRvdb>,
  handle?: MockRvdbHandle
): MockRvdb {
  const h = handle ?? createMockRvdbHandle();
  return {
    tick: vi.fn((): Promise<{ exit: boolean; cancel: boolean }> =>
      Promise.resolve({ exit: false, cancel: false })),
    into_emulator: vi.fn((): MockEmulator => createMockEmulator()),
    handle: vi.fn((): MockRvdbHandle => h),
    free: vi.fn(),
    ...overrides
  };
}

export const mockLoadWasmModule = vi.fn();
