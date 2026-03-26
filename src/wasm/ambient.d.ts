declare module "@wasm/riscv_emulator" {
  export default function init(): Promise<void>;
  export class WasmEmulator {
    static from_elf_bytes(bytes: Uint8Array): WasmEmulator;
    static from_bin_bytes(bytes: Uint8Array): WasmEmulator;

    step(): void;
    continue_for_steps(maxSteps: bigint): bigint;

    is_halted(): boolean;
    clock_cycles(): bigint;
    read_pc(): bigint;
    read_reg(index: number): bigint;

    push_uart_input(input: Uint8Array): void;
    take_uart_output(): Uint8Array;
  }
}
