import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync, WasmEmulator } from "@wasm/riscv_emulator";
import type { WasmRvdbHandle } from "@/features/emulator/wasmTypes";

const here = dirname(fileURLToPath(import.meta.url));
initSync({ module: readFileSync(resolve(here, "../../wasm-pkg/riscv_emulator_bg.wasm")) });
const elfBytes = readFileSync(resolve(here, "../../../public/test-programs/ecall_test.elf"));
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Pumps the JS event loop so an awaited wasm-bindgen future gets polled.
 *  Deterministic: no real timer, just resolved-promise yields. */
async function pump(times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

async function answerTerminalProbes(handle: WasmRvdbHandle): Promise<string> {
  await pump(2000);
  const sizeProbe = dec.decode(handle.take_repl_output());
  expect(sizeProbe).toContain("\x1b[6n");

  handle.push_repl_input(enc.encode("\x1b[24;80R"));
  await pump(2000);
  const promptOut = dec.decode(handle.take_repl_output());
  expect(promptOut).toContain("(rvdb)");
  expect(promptOut).toContain("\x1b[6n");

  handle.push_repl_input(enc.encode("\x1b[1;8R"));
  await pump(2000);
  expect(handle.take_repl_output().length).toBe(0);

  return sizeProbe + promptOut;
}

describe("probe: byte shuttle between JS and rvdb channel", () => {
  it("emits the prompt once tick is polled, and resolves a typed command", async () => {
    const emu = WasmEmulator.from_elf_bytes(elfBytes);
    const rvdb = await emu.into_rvdb();
    const handle = rvdb.handle();

    // REPL idle before tick: nothing emitted.
    expect(handle.take_repl_output().length).toBe(0);

    // Drive tick. noline first probes terminal size via DSR/CPR before it can
    // draw the prompt; in the browser, xterm.js replies through onData.
    const tickP = rvdb.tick();
    await answerTerminalProbes(handle);

    // Type a no-op line: empty line returns exit:false immediately.
    handle.push_repl_input(enc.encode("\n"));
    const response = await tickP;
    expect(response.exit).toBe(false);

    // After tick resolves, noline has echoed the newline; re-driving tick starts
    // the next prompt. A real command produces output.
    const tickP2 = rvdb.tick();
    await answerTerminalProbes(handle);

    handle.push_repl_input(enc.encode("print pc\n"));
    const r2 = await tickP2;
    const cmdOut = dec.decode(handle.take_repl_output());
    expect(r2.exit).toBe(false);
    expect(cmdOut).toContain("pc = ");
  }, 10_000);
});
