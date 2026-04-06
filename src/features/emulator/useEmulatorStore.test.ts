import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEmulatorStore } from "./useEmulatorStore";
import { createMockEmulator, createMockWasmModule } from "@/test/mocks";
import * as wasmLoader from "./wasmLoader";

// Mock the WASM loader module
vi.mock("./wasmLoader", () => ({
  loadWasmModule: vi.fn()
}));

describe("useEmulatorStore - Load Functionality", () => {
  const mockEmulator = createMockEmulator();
  const mockWasm = createMockWasmModule(mockEmulator);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wasmLoader.loadWasmModule).mockResolvedValue(mockWasm as any);
    
    // Reset store state
    const { result } = renderHook(() => useEmulatorStore());
    act(() => {
      useEmulatorStore.setState({
        emulator: null,
        loading: false,
        executionState: useEmulatorStore.getState().executionState,
        boardHalted: false,
        error: null,
        cycles: 0n,
        pc: 0n,
        regs: Array(32).fill(0n),
        uartText: "",
        animationFrameId: null
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadProgram (from File)", () => {
    it("should set loading state to true when starting load", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });

      act(() => {
        void result.current.loadProgram(file, "elf");
      });

      // Check immediate state
      expect(result.current.loading).toBe(true);
      expect(result.current.emulator).toBe(null);
      expect(result.current.error).toBe(null);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should successfully load an ELF file", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const fileContent = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]); // ELF magic bytes
      const file = new File([fileContent], "test.elf", { type: "application/octet-stream" });

      await act(async () => {
        await result.current.loadProgram(file, "elf");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.emulator).toBe(mockEmulator);
        expect(result.current.error).toBe(null);
        expect(mockWasm.WasmEmulator.from_elf_bytes).toHaveBeenCalled();
      });
    });

    it("should successfully load a BIN file", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const fileContent = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const file = new File([fileContent], "test.bin", { type: "application/octet-stream" });

      await act(async () => {
        await result.current.loadProgram(file, "bin");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.emulator).toBe(mockEmulator);
        expect(result.current.error).toBe(null);
        expect(mockWasm.WasmEmulator.from_bin_bytes).toHaveBeenCalled();
      });
    });

    it("should clear previous state when loading new program", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      
      // Set some existing state
      act(() => {
        useEmulatorStore.setState({
          uartText: "previous output",
          pc: 0x12345678n,
          cycles: 1000n,
          error: "previous error"
        });
      });

      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });

      await act(async () => {
        await result.current.loadProgram(file, "elf");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.uartText).toBe("");
        expect(result.current.pc).not.toBe(0x12345678n);
        expect(result.current.cycles).not.toBe(1000n);
        expect(result.current.error).toBe(null);
      });
    });

    it("should cancel animation frame before loading", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
      
      // Set an active animation frame
      act(() => {
        useEmulatorStore.setState({ animationFrameId: 123 });
      });

      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });

      await act(async () => {
        await result.current.loadProgram(file, "elf");
      });

      expect(cancelSpy).toHaveBeenCalledWith(123);
      
      await waitFor(() => {
        expect(result.current.animationFrameId).toBe(null);
      });
    });

    it("should handle load errors gracefully", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const errorMessage = "Failed to parse ELF";
      
      vi.mocked(wasmLoader.loadWasmModule).mockResolvedValue({
        WasmEmulator: {
          from_elf_bytes: vi.fn(() => {
            throw new Error(errorMessage);
          }),
          from_bin_bytes: vi.fn()
        }
      } as any);

      const file = new File(["invalid"], "test.elf", { type: "application/octet-stream" });

      await act(async () => {
        await result.current.loadProgram(file, "elf");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.emulator).toBe(null);
        expect(result.current.error).toBe(errorMessage);
      });
    });

    it("should not have emulator running after failed load", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      
      vi.mocked(wasmLoader.loadWasmModule).mockResolvedValue({
        WasmEmulator: {
          from_elf_bytes: vi.fn(() => {
            throw new Error("Load failed");
          }),
          from_bin_bytes: vi.fn()
        }
      } as any);

      const file = new File(["invalid"], "test.elf", { type: "application/octet-stream" });

      await act(async () => {
        await result.current.loadProgram(file, "elf");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.emulator).toBe(null);
        expect(result.current.executionState).toBe("Paused");
      });
    });
  });

  describe("loadProgramFromUrl (Built-in Programs)", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it("should successfully load program from URL", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const mockData = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
      
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockData.buffer
      } as Response);

      await act(async () => {
        await result.current.loadProgramFromUrl("/test-programs/fib.elf", "elf");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.emulator).toBe(mockEmulator);
        expect(result.current.error).toBe(null);
        expect(global.fetch).toHaveBeenCalledWith("/test-programs/fib.elf");
      });
    });

    it("should handle network errors", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found"
      } as Response);

      await act(async () => {
        await result.current.loadProgramFromUrl("/test-programs/missing.elf", "elf");
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.emulator).toBe(null);
        expect(result.current.error).toContain("404");
        expect(result.current.error).toContain("Not Found");
      });
    });

    it("should cancel animation frame before loading from URL", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
      
      act(() => {
        useEmulatorStore.setState({ animationFrameId: 456 });
      });

      const mockData = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockData.buffer
      } as Response);

      await act(async () => {
        await result.current.loadProgramFromUrl("/test-programs/test.elf", "elf");
      });

      expect(cancelSpy).toHaveBeenCalledWith(456);
      
      await waitFor(() => {
        expect(result.current.animationFrameId).toBe(null);
      });
    });

    it("should clear previous state when loading from URL", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      
      act(() => {
        useEmulatorStore.setState({
          uartText: "old data",
          pc: 0xffffffffn,
          cycles: 99999n
        });
      });

      const mockData = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockData.buffer
      } as Response);

      await act(async () => {
        await result.current.loadProgramFromUrl("/test-programs/test.elf", "elf");
      });

      await waitFor(() => {
        expect(result.current.uartText).toBe("");
        expect(result.current.pc).not.toBe(0xffffffffn);
        expect(result.current.cycles).not.toBe(99999n);
      });
    });
  });

  describe("Load State Consistency", () => {
    it("should process only first loadProgram when clicked rapidly", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const file1 = new File(["test1"], "test1.elf", { type: "application/octet-stream" });
      const file2 = new File(["test2"], "test2.elf", { type: "application/octet-stream" });

      const resolveRef: { current: (value: any) => void } = { current: () => undefined };
      const pendingWasm = new Promise<any>((resolve) => {
        resolveRef.current = resolve;
      });

      vi.mocked(wasmLoader.loadWasmModule).mockReturnValueOnce(pendingWasm as Promise<any>);

      act(() => {
        void result.current.loadProgram(file1, "elf");
        void result.current.loadProgram(file2, "elf");
      });

      await waitFor(() => {
        expect(wasmLoader.loadWasmModule).toHaveBeenCalledTimes(1);
      });

      resolveRef.current(mockWasm);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should ignore loadProgram calls while already loading", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const file = new File(["test1"], "test1.elf", { type: "application/octet-stream" });

      act(() => {
        useEmulatorStore.setState({ loading: true });
      });

      act(() => {
        void result.current.loadProgram(file, "elf");
      });

      expect(result.current.loading).toBe(true);
      expect(wasmLoader.loadWasmModule).not.toHaveBeenCalled();
    });

    it("should ignore loadProgramFromUrl calls while already loading", async () => {
      const { result } = renderHook(() => useEmulatorStore());

      global.fetch = vi.fn();

      act(() => {
        useEmulatorStore.setState({ loading: true });
      });

      act(() => {
        void result.current.loadProgramFromUrl("/test-programs/fib.elf", "elf");
      });

      expect(result.current.loading).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(wasmLoader.loadWasmModule).not.toHaveBeenCalled();
    });

    it("should preserve emulator instance after successful load", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });

      await act(async () => {
        await result.current.loadProgram(file, "elf");
      });

      await waitFor(() => {
        expect(result.current.emulator).not.toBe(null);
      });

      const firstEmulator = result.current.emulator;

      // Wait and check it's still the same
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(result.current.emulator).toBe(firstEmulator);
    });

    it("should reset all state flags correctly on load start", async () => {
      const { result } = renderHook(() => useEmulatorStore());
      
      // Set various states
      act(() => {
        useEmulatorStore.setState({
          emulator: mockEmulator,
          loading: false,
          boardHalted: true,
          error: "some error",
          executionState: "Running" as any
        });
      });

      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });

      act(() => {
        void result.current.loadProgram(file, "elf");
      });

      // Immediately check state was reset
      expect(result.current.loading).toBe(true);
      expect(result.current.emulator).toBe(null);
      expect(result.current.error).toBe(null);
      expect(result.current.boardHalted).toBe(false);
      expect(result.current.executionState).toBe("Paused");
      expect(result.current.animationFrameId).toBe(null);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should dispose previous emulator after successful replacement", async () => {
      const previousEmulator = createMockEmulator();
      const nextEmulator = createMockEmulator();

      vi.mocked(wasmLoader.loadWasmModule).mockResolvedValue({
        WasmEmulator: {
          from_elf_bytes: vi.fn(() => nextEmulator),
          from_bin_bytes: vi.fn(() => nextEmulator)
        }
      } as any);

      const { result } = renderHook(() => useEmulatorStore());

      act(() => {
        useEmulatorStore.setState({ emulator: previousEmulator });
      });

      const file = new File(["test"], "replace.elf", { type: "application/octet-stream" });
      await act(async () => {
        await result.current.loadProgram(file, "elf");
      });

      expect((previousEmulator as unknown as { free: () => void }).free).toHaveBeenCalledTimes(1);
      expect(result.current.emulator).toBe(nextEmulator);
    });

    it("should keep previous emulator when new load fails", async () => {
      const previousEmulator = createMockEmulator();

      vi.mocked(wasmLoader.loadWasmModule).mockResolvedValue({
        WasmEmulator: {
          from_elf_bytes: vi.fn(() => {
            throw new Error("unreachable executed");
          }),
          from_bin_bytes: vi.fn()
        }
      } as any);

      const { result } = renderHook(() => useEmulatorStore());

      act(() => {
        useEmulatorStore.setState({ emulator: previousEmulator });
      });

      const file = new File(["bad"], "broken.elf", { type: "application/octet-stream" });
      await act(async () => {
        await result.current.loadProgram(file, "elf");
      });

      expect(result.current.emulator).toBe(previousEmulator);
      expect(result.current.error).toContain("unreachable executed");
      expect((previousEmulator as unknown as { free: () => void }).free).not.toHaveBeenCalled();
    });
  });
});
