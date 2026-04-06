import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlBar } from "./ControlBar";
import { useEmulatorStore } from "@/features/emulator/useEmulatorStore";
import { createMockEmulator } from "@/test/mocks";

vi.mock("@/features/emulator/useEmulatorStore", () => ({
  useEmulatorStore: vi.fn(),
  EmulatorStatus: {
    Running: "Running",
    Paused: "Paused"
  }
}));

describe("ControlBar - Load State Management", () => {
  const mockLoadProgram = vi.fn();
  const mockLoadProgramFromUrl = vi.fn();
  const mockStartRun = vi.fn();
  const mockPauseRun = vi.fn();
  const mockStepOnce = vi.fn();
  const mockClearUart = vi.fn();

  const defaultStoreState = {
    loadProgram: mockLoadProgram,
    loadProgramFromUrl: mockLoadProgramFromUrl,
    loading: false,
    executionState: "Paused" as const,
    startRun: mockStartRun,
    pauseRun: mockPauseRun,
    stepOnce: mockStepOnce,
    clearUart: mockClearUart,
    emulator: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default fetch returns failed manifest
    global.fetch = vi.fn().mockRejectedValue(new Error("Not found"));
    
    vi.mocked(useEmulatorStore).mockReturnValue(defaultStoreState);
  });

  describe("File Selection", () => {
    it("should enable Load button when file is selected", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const loadButton = screen.getByRole("button", { name: /load/i });

      expect(loadButton).toBeDisabled();

      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });
      await user.upload(fileInput, file);

      expect(loadButton).not.toBeDisabled();
    });

    it("should auto-detect ELF format from filename", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const formatSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;

      const file = new File(["test"], "program.elf", { type: "application/octet-stream" });
      await user.upload(fileInput, file);

      expect(formatSelect.value).toBe("elf");
    });

    it("should auto-detect BIN format from filename", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const formatSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;

      const file = new File(["test"], "program.bin", { type: "application/octet-stream" });
      await user.upload(fileInput, file);

      expect(formatSelect.value).toBe("bin");
    });

    it("should show hint message when file is selected but not loaded", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });
      
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/Selected: test.elf/i)).toBeInTheDocument();
        expect(screen.getByText(/Click Load to start/i)).toBeInTheDocument();
      });
    });

    it("should hide hint message after emulator is loaded", () => {
      vi.mocked(useEmulatorStore).mockReturnValue({
        ...defaultStoreState,
        emulator: createMockEmulator()
      });

      render(<ControlBar />);

      expect(screen.queryByText(/Click Load to start/i)).not.toBeInTheDocument();
    });
  });

  describe("Built-in Programs", () => {
    beforeEach(() => {
      vi.mocked(global.fetch).mockImplementation((url) => {
        if (url === "/test-programs/manifest.json") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              programs: [
                { id: "fib", file: "fib.elf" },
                { id: "prime", file: "prime.elf" }
              ]
            })
          } as Response);
        }
        return Promise.reject(new Error("Not found"));
      });
    });

    it("should load and display built-in programs", async () => {
      render(<ControlBar />);

      await waitFor(() => {
        expect(screen.getByText("Built-in Programs:")).toBeInTheDocument();
      });

      const builtInSelect = screen.getAllByRole("combobox")[1];
      expect(builtInSelect).toBeInTheDocument();
    });

    it("should enable Load button when built-in program is selected", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText("Built-in Programs:")).toBeInTheDocument();
      });

      const loadButton = screen.getByRole("button", { name: /load/i });
      expect(loadButton).toBeDisabled();

      const builtInSelect = screen.getAllByRole("combobox")[1];
      await user.selectOptions(builtInSelect, "fib.elf");

      expect(loadButton).not.toBeDisabled();
    });

    it("should call loadProgramFromUrl when loading built-in program", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText("Built-in Programs:")).toBeInTheDocument();
      });

      const builtInSelect = screen.getAllByRole("combobox")[1];
      await user.selectOptions(builtInSelect, "fib.elf");

      const loadButton = screen.getByRole("button", { name: /load/i });
      await user.click(loadButton);

      expect(mockLoadProgramFromUrl).toHaveBeenCalledWith("/test-programs/fib.elf", "elf");
      expect(mockLoadProgram).not.toHaveBeenCalled();
    });

    it("should hide built-in section when manifest fails to load", async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error("404"));

      render(<ControlBar />);

      await waitFor(() => {
        expect(screen.queryByText("Built-in Programs:")).not.toBeInTheDocument();
      });
    });

    it("should show hint for selected built-in program", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText("Built-in Programs:")).toBeInTheDocument();
      });

      const builtInSelect = screen.getAllByRole("combobox")[1];
      await user.selectOptions(builtInSelect, "fib.elf");

      await waitFor(() => {
        expect(screen.getByText(/Selected: fib/i)).toBeInTheDocument();
      });
    });
  });

  describe("Mutual Exclusion", () => {
    beforeEach(() => {
      vi.mocked(global.fetch).mockImplementation((url) => {
        if (url === "/test-programs/manifest.json") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              programs: [{ id: "fib", file: "fib.elf" }]
            })
          } as Response);
        }
        return Promise.reject(new Error("Not found"));
      });
    });

    it("should clear built-in selection when file is selected", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText("Built-in Programs:")).toBeInTheDocument();
      });

      // Select built-in first
      const builtInSelect = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
      await user.selectOptions(builtInSelect, "fib.elf");
      expect(builtInSelect.value).toBe("fib.elf");

      // Then select file
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });
      await user.upload(fileInput, file);

      // Built-in should be cleared
      expect(builtInSelect.value).toBe("");
    });

    it("should clear file selection when built-in is selected", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText("Built-in Programs:")).toBeInTheDocument();
      });

      // Select file first
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["test"], "test.elf", { type: "application/octet-stream" });
      await user.upload(fileInput, file);

      // Verify file is selected
      await waitFor(() => {
        expect(screen.getByText(/Selected: test.elf/i)).toBeInTheDocument();
      });

      // Then select built-in
      const builtInSelect = screen.getAllByRole("combobox")[1];
      await user.selectOptions(builtInSelect, "fib.elf");

      // File selection should be cleared (hint should change)
      await waitFor(() => {
        expect(screen.getByText(/Selected: fib/i)).toBeInTheDocument();
        expect(screen.queryByText(/Selected: test.elf/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Loading State", () => {
    it("should disable Load button while loading", () => {
      vi.mocked(useEmulatorStore).mockReturnValue({
        ...defaultStoreState,
        loading: true
      });

      render(<ControlBar />);

      const loadButton = screen.getByRole("button", { name: /loading/i });
      expect(loadButton).toBeDisabled();
      expect(loadButton).toHaveTextContent("Loading...");
    });

    it("should disable all inputs while loading", () => {
      vi.mocked(useEmulatorStore).mockReturnValue({
        ...defaultStoreState,
        loading: true
      });

      render(<ControlBar />);

      const formatSelect = screen.getAllByRole("combobox")[0];
      expect(formatSelect).toBeEnabled(); // Format select is not disabled during loading
    });

    it("should not show hint while loading", async () => {
      vi.mocked(useEmulatorStore).mockReturnValue({
        ...defaultStoreState,
        loading: true
      });

      render(<ControlBar />);

      expect(screen.queryByText(/Click Load to start/i)).not.toBeInTheDocument();
    });
  });

  describe("Load UX Regression", () => {
    it("should call load only once when double-clicking Load rapidly", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["test"], "double.elf", { type: "application/octet-stream" });
      await user.upload(fileInput, file);

      const loadButton = screen.getByRole("button", { name: /load/i });
      await user.dblClick(loadButton);

      expect(mockLoadProgram).toHaveBeenCalledTimes(1);
    });

    it("should clear visible file selection after clicking Load", async () => {
      render(<ControlBar />);
      const user = userEvent.setup();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["test"], "clear-me.elf", { type: "application/octet-stream" });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/Selected: clear-me.elf/i)).toBeInTheDocument();
      });

      const loadButton = screen.getByRole("button", { name: /load/i });
      await user.click(loadButton);

      await waitFor(() => {
        expect(screen.queryByText(/Selected: clear-me.elf/i)).not.toBeInTheDocument();
      });
    });

    it("should show hint whenever a selection exists and not loading, even if emulator exists", async () => {
      vi.mocked(useEmulatorStore).mockReturnValue({
        ...defaultStoreState,
        emulator: createMockEmulator()
      });

      render(<ControlBar />);
      const user = userEvent.setup();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["test"], "hint.elf", { type: "application/octet-stream" });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/Selected: hint.elf/i)).toBeInTheDocument();
        expect(screen.getByText(/Click Load to start/i)).toBeInTheDocument();
      });
    });
  });

  describe("Action Buttons State", () => {
    it("should disable action buttons when no emulator loaded", () => {
      render(<ControlBar />);

      expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^step$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /clear uart/i })).toBeDisabled();
    });

    it("should enable action buttons when emulator is loaded", () => {
      vi.mocked(useEmulatorStore).mockReturnValue({
        ...defaultStoreState,
        emulator: createMockEmulator()
      });

      render(<ControlBar />);

      expect(screen.getByRole("button", { name: /^run$/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /^step$/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /clear uart/i })).not.toBeDisabled();
    });

    it("should disable Run and Step when emulator is running", () => {
      vi.mocked(useEmulatorStore).mockReturnValue({
        ...defaultStoreState,
        emulator: createMockEmulator(),
        executionState: "Running" as const
      });

      render(<ControlBar />);

      expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^step$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^pause$/i })).not.toBeDisabled();
    });
  });
});
