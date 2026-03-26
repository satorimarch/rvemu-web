export interface WasmEmulator {
  step(): void;
  continue_for_steps(maxSteps: bigint): bigint;
  is_halted(): boolean;
  clock_cycles(): bigint;
  read_pc(): bigint;
  read_reg(index: number): bigint;
  push_uart_input(input: Uint8Array): void;
  take_uart_output(): Uint8Array;
}

export interface WasmModule {
  default: () => Promise<void>;
  WasmEmulator: {
    from_elf_bytes(bytes: Uint8Array): WasmEmulator;
    from_bin_bytes(bytes: Uint8Array): WasmEmulator;
  };
}
