/// <reference types="vite/client" />


export function loadWasmModule(): Promise<WasmModule> {
  if (!cached) {
    cached = (async () => {
      const mod = (await import("@wasm/riscv_emulator")) as unknown as WasmModule;
      await mod.default();
      return mod;
    })();
  }
  return cached;
}
