/** Smoke tests against the real rvdb WASM module.
 *
 * Keep these at the JS/WASM API boundary. The interactive rvdb REPL is backed by
 * noline and expects a real terminal to answer ANSI cursor-position queries;
 * command semantics belong in Rust tests or browser-level tests with xterm.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync, WasmRvdb } from "@wasm/riscv_emulator";

const here = dirname(fileURLToPath(import.meta.url));

initSync({ module: readFileSync(resolve(here, "../../wasm-pkg/riscv_emulator_bg.wasm")) });

const elfBytes = readFileSync(resolve(here, "../../../public/test-programs/ecall_test.elf"));

describe("real rvdb WASM API", () => {
  it("creates an rvdb session and exposes a readable handle snapshot", async () => {
    const rvdb = await WasmRvdb.from_elf_bytes(elfBytes);
    const handle = rvdb.handle();

    expect(typeof handle.read_pc()).toBe("bigint");
    expect(handle.clock_cycles()).toBe(0n);
    expect(Array.from(handle.read_regs())).toHaveLength(32);
    expect(handle.is_halted()).toBe(false);
  });

  it("exposes symbol-file loading errors at the handle boundary", async () => {
    const rvdb = await WasmRvdb.from_elf_bytes(elfBytes);
    const handle = rvdb.handle();

    expect(() => handle.load_symbol_file(elfBytes)).not.toThrow();

    expect(() => handle.load_symbol_file(new Uint8Array([1, 2, 3, 4]))).toThrow(
      /Failed to parse ELF file/
    );
  });
});
