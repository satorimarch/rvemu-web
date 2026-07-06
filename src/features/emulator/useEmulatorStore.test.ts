import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEmulatorStore } from "./useEmulatorStore";
import { createMockEmulator, createMockWasmModule, createMockRvdb, createMockRvdbHandle, type MockEmulator, type MockWasmModule } from "@/test/mocks";
import * as wasmLoader from "./wasmLoader";
import type { WasmModule } from "./wasmTypes";

vi.mock("./wasmLoader", () => ({
  loadWasmModule: vi.fn()
}));

function resetStoreState(): void {
  useEmulatorStore.setState({
    status: "idle",
    mode: "run",
    emulator: null,
    rvdb: null,
    rvdbHandle: null,
    error: null,
    pc: 0n,
    cycles: 0n,
    regs: Array.from({ length: 32 }, () => 0n),
    uartText: "",
    uartEpoch: 0,
    rvdbText: "",
    rvdbEpoch: 0,
    debugRunning: false,
    haltPc: null,
    lastLoadedBytes: null,
    speed: "normal",
    animationFrameId: null
  });
}

describe("useEmulatorStore", () => {
  let mockEmulator: MockEmulator;
  let mockWasm: MockWasmModule;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmulator = createMockEmulator();
    mockWasm = createMockWasmModule(mockEmulator);
    vi.mocked(wasmLoader.loadWasmModule).mockResolvedValue(mockWasm as unknown as WasmModule);
    resetStoreState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadFile", () => {
    it("transitions loading → ready on success", async () => {
      const file = new File([new Uint8Array([1, 2, 3])], "prog.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });

      expect(result.current.status).toBe("ready");
      expect(result.current.emulator).toBe(mockEmulator);
      expect(mockWasm.WasmEmulator.from_elf_bytes).toHaveBeenCalledOnce();
      expect(result.current.error).toBeNull();
    });

    it("uses from_bin_bytes for bin format", async () => {
      const file = new File([new Uint8Array([1])], "prog.bin");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "bin");
      });

      expect(mockWasm.WasmEmulator.from_bin_bytes).toHaveBeenCalledOnce();
      expect(result.current.status).toBe("ready");
    });

    it("reads pc/cycles/regs after load", async () => {
      const file = new File([new Uint8Array([1])], "prog.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });

      expect(result.current.pc).toBe(0x80000000n);
      expect(result.current.cycles).toBe(100n);
      expect(result.current.regs).toHaveLength(32);
      expect(result.current.regs[5]).toBe(50n);
    });

    it("reduces to error on failure and clears emulator", async () => {
      vi.mocked(wasmLoader.loadWasmModule).mockRejectedValue(new Error("boom"));
      const file = new File([new Uint8Array([1])], "prog.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });

      expect(result.current.status).toBe("error");
      expect(result.current.emulator).toBeNull();
      expect(result.current.error).toBe("boom");
    });

    it("surfaces errors returned by the WASM board constructor", async () => {
      mockWasm.WasmEmulator.from_bin_bytes.mockImplementation(() => {
        throw "binary load failed: image does not fit in RAM";
      });
      const file = new File([new Uint8Array([1])], "prog.bin");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "bin");
      });

      expect(result.current.status).toBe("error");
      expect(result.current.emulator).toBeNull();
      expect(result.current.error).toBe("binary load failed: image does not fit in RAM");
    });

    it("disposes previous emulator on reload", async () => {
      const file1 = new File([new Uint8Array([1])], "a.elf");
      const file2 = new File([new Uint8Array([2])], "b.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file1, "elf");
      });
      const firstEmu = result.current.emulator;
      expect(firstEmu).not.toBeNull();

      const secondEmu = createMockEmulator({ read_pc: vi.fn((): bigint => 0x1000n) });
      const secondWasm = createMockWasmModule(secondEmu);
      vi.mocked(wasmLoader.loadWasmModule).mockResolvedValue(secondWasm as unknown as WasmModule);

      await act(async () => {
        await result.current.loadFile(file2, "elf");
      });

      expect((firstEmu as unknown as MockEmulator).free).toHaveBeenCalledOnce();
      expect(result.current.emulator).toBe(secondEmu);
    });
  });

  describe("loadFromUrl", () => {
    it("fetches bytes then loads", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(new Uint8Array([9, 9]), { status: 200 })
      );
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFromUrl("http://x/prog.elf", "elf");
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(result.current.status).toBe("ready");
      fetchSpy.mockRestore();
    });

    it("errors on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 404, statusText: "Not Found" })
      );
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFromUrl("http://x/missing.elf", "elf");
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("404");
    });
  });

  describe("step", () => {
    it("advances and appends UART output", async () => {
      mockEmulator.take_uart_output.mockReturnValueOnce(new Uint8Array([72, 105])); // "Hi"
      const file = new File([new Uint8Array([1])], "p.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });
      await act(async () => {
        result.current.step();
      });

      expect(mockEmulator.step).toHaveBeenCalledOnce();
      expect(result.current.uartText).toBe("Hi");
    });

    it("transitions to halted when is_halted returns true", async () => {
      mockEmulator.is_halted.mockReturnValue(true);
      const file = new File([new Uint8Array([1])], "p.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });

      expect(result.current.status).toBe("halted");
    });
  });

  describe("run / pause", () => {
    it("sets running status on run", async () => {
      const file = new File([new Uint8Array([1])], "p.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });
      act(() => result.current.run());

      expect(result.current.status).toBe("running");
      expect(result.current.animationFrameId).not.toBeNull();
    });

    it("pause returns to ready and cancels frame", async () => {
      const file = new File([new Uint8Array([1])], "p.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });
      act(() => result.current.run());
      act(() => result.current.pause());

      expect(result.current.status).toBe("ready");
      expect(result.current.animationFrameId).toBeNull();
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("re-instantiates emulator from cached bytes on reset", async () => {
      const file = new File([new Uint8Array([1])], "p.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });
      const firstEmu = result.current.emulator as unknown as MockEmulator;

      await act(async () => {
        await result.current.reset();
      });

      expect(firstEmu.free).toHaveBeenCalledOnce();
      expect(mockWasm.WasmEmulator.from_elf_bytes).toHaveBeenCalledTimes(2);
      expect(result.current.emulator).not.toBeNull();
      expect(result.current.status).toBe("ready");
      expect(result.current.pc).toBe(0x80000000n);
      expect(result.current.uartText).toBe("");
    });

    it("falls back to idle teardown when no program is cached", async () => {
      // Simulate a failed load that never populated lastLoadedBytes (e.g., WASM
      // init failure before instantiation). Reset should clear to idle, not throw.
      vi.mocked(wasmLoader.loadWasmModule).mockRejectedValue(new Error("wasm unavailable"));
      const file = new File([new Uint8Array([1])], "p.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });

      expect(result.current.status).toBe("error");
      expect(result.current.lastLoadedBytes).toBeNull();

      // Restore the mock so reset can re-instantiate (though there's nothing to
      // re-instantiate — it should take the idle-teardown branch).
      vi.mocked(wasmLoader.loadWasmModule).mockResolvedValue(mockWasm as unknown as WasmModule);

      await act(async () => {
        await result.current.reset();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.emulator).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("setSpeed", () => {
    it("updates speed preset", () => {
      const { result } = renderHook(() => useEmulatorStore());
      act(() => result.current.setSpeed("turbo"));
      expect(result.current.speed).toBe("turbo");
    });
  });

  describe("enterDebugMode / exitDebugMode", () => {
    it("enters debug mode: emulator → rvdb, ticks the REPL chain, drains output", async () => {
      const file = new File([new Uint8Array([1])], "prog.elf");
      const { result } = renderHook(() => useEmulatorStore());

      await act(async () => {
        await result.current.loadFile(file, "elf");
      });
      const emu = result.current.emulator as MockEmulator;

      // into_rvdb resolves to an rvdb whose first tick yields some REPL output
      // and then a second tick (pending — simulating readline waiting for input).
      const rvdbOutput = new TextEncoder().encode("(rvdb) ");
      const firstTickReturn = { exit: false, cancel: false };
      // Second tick stays pending; we resolve it to observe the exit path.
      const { promise: secondTick, resolve: resolveSecondTick } =
        Promise.withResolvers<{ exit: boolean; cancel: boolean }>();

      const mockHandle = createMockRvdbHandle({
        take_repl_output: vi.fn()
          .mockReturnValueOnce(rvdbOutput)
          .mockReturnValue(new Uint8Array()),
        read_pc: vi.fn((): bigint => 0x80000abcn),
        clock_cycles: vi.fn((): bigint => 42n)
      });
      const mockRvdb = createMockRvdb({
        tick: vi.fn()
          .mockResolvedValueOnce(firstTickReturn)
          .mockReturnValueOnce(secondTick)
      }, mockHandle);
      emu.into_rvdb.mockResolvedValue(mockRvdb);

      await act(async () => {
        await result.current.enterDebugMode();
      });

      // Microtask flush so the first tick resolves + drains.
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode).toBe("debug");
      expect(result.current.emulator).toBeNull();
      expect(result.current.rvdb).toBe(mockRvdb);
      expect(result.current.rvdbText).toBe("(rvdb) ");
      expect(result.current.pc).toBe(0x80000abcn);
    expect(mockHandle.read_regs).toHaveBeenCalled();

      // Now exit: resolve the pending second tick so tick-chain completion runs.
      await act(async () => {
        result.current.exitDebugMode();
        resolveSecondTick({ exit: false, cancel: false });
        await secondTick;
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.mode).toBe("run");
      expect(result.current.rvdb).toBeNull();
      expect(result.current.emulator).not.toBeNull();
      // into_emulator was called on the rvdb to recover a WasmEmulator.
      expect(mockRvdb.into_emulator).toHaveBeenCalled();
    });

    it("exitDebugMode is blocked while debugRunning (continue in flight)", async () => {
      const file = new File([new Uint8Array([1])], "prog.elf");
      const { result } = renderHook(() => useEmulatorStore());
      await act(async () => { await result.current.loadFile(file, "elf"); });
      const emu = result.current.emulator as MockEmulator;

      const { promise: pendingTick } = Promise.withResolvers<{ exit: boolean; cancel: boolean }>();
      const mockRvdb = createMockRvdb({ tick: vi.fn().mockReturnValue(pendingTick) });
      emu.into_rvdb.mockResolvedValue(mockRvdb);

      await act(async () => { await result.current.enterDebugMode(); });

      // Force debugRunning true — simulating a continue in flight.
      act(() => useEmulatorStore.setState({ debugRunning: true }));

      await act(async () => {
        result.current.exitDebugMode();
        await Promise.resolve();
      });

      // Still in debug mode; exitDebugMode is a no-op while debugRunning.
      expect(result.current.mode).toBe("debug");
    });

    it("keeps debug status running while rvdb continue is active even when PC is stable", async () => {
      const file = new File([new Uint8Array([1])], "prog.elf");
      const { result } = renderHook(() => useEmulatorStore());
      await act(async () => { await result.current.loadFile(file, "elf"); });
      const emu = result.current.emulator as MockEmulator;

      const { promise: pendingTick, resolve: resolvePendingTick } =
        Promise.withResolvers<{ exit: boolean; cancel: boolean }>();
      const mockHandle = createMockRvdbHandle({
        is_continue_running: vi.fn((): boolean => true),
        read_pc: vi.fn((): bigint => 0x80000abcn)
      });
      const mockRvdb = createMockRvdb({
        tick: vi.fn().mockReturnValue(pendingTick)
      }, mockHandle);
      emu.into_rvdb.mockResolvedValue(mockRvdb);

      await act(async () => { await result.current.enterDebugMode(); });

      await waitFor(() => expect(result.current.status).toBe("running"));
      expect(result.current.debugRunning).toBe(true);
      expect(result.current.pc).toBe(0x80000abcn);

      await act(async () => {
        await result.current.reset();
        resolvePendingTick({ exit: false, cancel: true });
        await pendingTick;
        await Promise.resolve();
      });
    });

    it("reset retires a borrowed debug session and returns to run", async () => {
      const file = new File([new Uint8Array([1])], "prog.elf");
      const { result } = renderHook(() => useEmulatorStore());
      await act(async () => { await result.current.loadFile(file, "elf"); });
      const emu = result.current.emulator as MockEmulator;

      const { promise: pendingTick, resolve: resolvePendingTick } =
        Promise.withResolvers<{ exit: boolean; cancel: boolean }>();
      const mockHandle = createMockRvdbHandle();
      const mockRvdb = createMockRvdb({
        tick: vi.fn().mockReturnValue(pendingTick),
        free: vi.fn()
      }, mockHandle);
      emu.into_rvdb.mockResolvedValue(mockRvdb);

      await act(async () => { await result.current.enterDebugMode(); });
      expect(result.current.mode).toBe("debug");

      await act(async () => { await result.current.reset(); });

      expect(result.current.mode).toBe("run");
      expect(result.current.rvdb).toBeNull();
      expect(mockHandle.cancel_continue).toHaveBeenCalledOnce();
      expect(mockHandle.push_repl_input).toHaveBeenCalledOnce();
      expect(mockRvdb.free).not.toHaveBeenCalled();
      expect(result.current.emulator).not.toBeNull();

      await act(async () => {
        resolvePendingTick({ exit: false, cancel: true });
        await pendingTick;
        await Promise.resolve();
      });

      expect(mockRvdb.free).toHaveBeenCalledOnce();
      expect(mockHandle.free).toHaveBeenCalledOnce();
      expect(result.current.mode).toBe("run");
    });
  });
});
