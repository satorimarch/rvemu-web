/** Result of executing one REPL line via WasmRvdb.tick(). */
export interface REPLResponse {
  /** Whether a `quit`/`exit` command was issued. */
  exit: boolean;
  /** Whether a `continue` command was canceled. */
  cancel: boolean;
}

export interface WasmEmulator {
  step(): void;
  continue_for_steps(maxSteps: bigint): bigint;
  into_rvdb(): Promise<WasmRvdb>;
  is_halted(): boolean;
  clock_cycles(): bigint;
  read_pc(): bigint;
  read_reg(index: number): bigint;
  read_regs(): BigUint64Array;
  push_uart_input(input: Uint8Array): void;
  take_uart_output(): Uint8Array;
}

/** Board-state + channel handle on an active rvdb session. Obtained from
 *  WasmRvdb.handle(); all reads (pc/regs/cycles), halt checks, and the REPL
 *  + UART I/O channels live here. Safe to use between ticks. */
export interface WasmRvdbHandle {
  clock_cycles(): bigint;
  cancel_continue(): void;
  push_repl_input(input: Uint8Array): void;
  push_uart_input(input: Uint8Array): void;
  load_symbol_file(bytes: Uint8Array): void;
  take_repl_output(): Uint8Array;
  take_uart_output(): Uint8Array;
  read_pc(): bigint;
  read_reg(index: number): bigint;
  read_regs(): BigUint64Array;
  is_halted(): boolean;
  is_continue_running(): boolean;
}

/** The rvdb debugger REPL. Owns the noline editor + RvdbSession; the board and
 *  its channels are reached via handle(). tick() reads one line from the REPL
 *  input channel and executes it, resolving when the line has been processed
 *  (stays pending while the editor waits for a full line, or while a `continue`
 *  runs in stepped chunks). into_emulator() converts back to a WasmEmulator. */
export interface WasmRvdb {
  tick(): Promise<REPLResponse>;
  into_emulator(): WasmEmulator;
  handle(): WasmRvdbHandle;
  free(): void;
}

export interface WasmModule {
  default: () => Promise<unknown>;
  WasmEmulator: {
    from_elf_bytes(bytes: Uint8Array): WasmEmulator;
    from_bin_bytes(bytes: Uint8Array): WasmEmulator;
  };
  WasmRvdb: {
    from_elf_bytes(bytes: Uint8Array): Promise<WasmRvdb>;
    from_bin_bytes(bytes: Uint8Array): Promise<WasmRvdb>;
  };
}
