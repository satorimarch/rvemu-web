declare module "@wasm/riscv_emulator" {
  export default function init(): Promise<void>;
  export function initSync(module: BufferSource | WebAssembly.Module): unknown;

  export interface REPLResponse {
    exit: boolean;
    cancel: boolean;
  }

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

    into_rvdb(): Promise<WasmRvdb>;
  }

  export class WasmRvdb {
    static from_elf_bytes(bytes: Uint8Array): Promise<WasmRvdb>;
    static from_bin_bytes(bytes: Uint8Array): Promise<WasmRvdb>;

    tick(): Promise<REPLResponse>;
    into_emulator(): WasmEmulator;
    handle(): WasmRvdbHandle;
  }

  export class WasmRvdbHandle {
    cancel_continue(): void;
    push_repl_input(input: Uint8Array): void;
    take_repl_output(): Uint8Array;
    push_uart_input(input: Uint8Array): void;
    take_uart_output(): Uint8Array;
    load_symbol_file(bytes: Uint8Array): void;
    is_halted(): boolean;
    clock_cycles(): bigint;
    read_pc(): bigint;
    read_reg(index: number): bigint;
    read_regs(): BigUint64Array;
    is_continue_running(): boolean;
  }
}
