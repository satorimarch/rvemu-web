import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ControlBar } from "./ControlBar";
import { useEmulatorStore, type EmulatorState } from "@/features/emulator/useEmulatorStore";
import { createMockEmulator, type MockEmulator } from "@/test/mocks";

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

type MockActions = {
  loadFile: Mock;
  loadFromUrl: Mock;
  run: Mock;
  pause: Mock;
  step: Mock;
  reset: Mock;
  setSpeed: Mock;
};

function setStoreState(partial: Partial<EmulatorState>): void {
  useEmulatorStore.setState(partial);
}

function mockActions(): MockActions {
  const loadFile = vi.fn();
  const loadFromUrl = vi.fn();
  const run = vi.fn();
  const pause = vi.fn();
  const step = vi.fn();
  const reset = vi.fn();
  const setSpeed = vi.fn();
  setStoreState({ loadFile, loadFromUrl, run, pause, step, reset, setSpeed });
  return { loadFile, loadFromUrl, run, pause, step, reset, setSpeed };
}

describe("ControlBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStoreState();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ programs: [] }), { status: 200 })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Load controls", () => {
    mockActions();
    const { container } = render(<ControlBar />);
    expect(screen.getByText("Load")).toBeInTheDocument();
    // Format select is hidden until a program is staged (progressive disclosure).
    expect(screen.queryByText("ELF")).not.toBeInTheDocument();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "prog.elf");
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("ELF")).toBeInTheDocument();
  });

  it("disables Load when nothing selected", () => {
    mockActions();
    render(<ControlBar />);
    expect(screen.getByText("Load")).toBeDisabled();
  });

  it("enables Load after picking a file", () => {
    mockActions();
    const { container } = render(<ControlBar />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "prog.elf");
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("Load")).toBeEnabled();
  });

  it("Run/Pause/Step/Reset are disabled when status is idle", () => {
    mockActions();
    render(<ControlBar />);
    expect(screen.getByText("Run")).toBeDisabled();
    expect(screen.getByText("Pause")).toBeDisabled();
    expect(screen.getByText("Step")).toBeDisabled();
    expect(screen.getByText("Reset")).toBeDisabled();
  });

  it("Run enabled, Pause disabled when ready", () => {
    const actions = mockActions();
    const emu: MockEmulator = createMockEmulator();
    setStoreState({ status: "ready", emulator: emu });
    render(<ControlBar />);

    expect(screen.getByText("Run")).toBeEnabled();
    expect(screen.getByText("Pause")).toBeDisabled();
    expect(screen.getByText("Step")).toBeEnabled();
    expect(screen.getByText("Reset")).toBeEnabled();

    fireEvent.click(screen.getByText("Run"));
    expect(actions.run).toHaveBeenCalledOnce();
  });

  it("Pause enabled, Run disabled when running", () => {
    const actions = mockActions();
    const emu: MockEmulator = createMockEmulator();
    setStoreState({ status: "running", emulator: emu, animationFrameId: 1 });
    render(<ControlBar />);

    expect(screen.getByText("Run")).toBeDisabled();
    expect(screen.getByText("Pause")).toBeEnabled();
    expect(screen.getByText("Step")).toBeDisabled();

    fireEvent.click(screen.getByText("Pause"));
    expect(actions.pause).toHaveBeenCalledOnce();
  });

  it("keeps run-mode Pause disabled during rvdb continue", () => {
    mockActions();
    setStoreState({
      status: "running",
      mode: "debug",
      debugRunning: true,
      emulator: null
    });
    render(<ControlBar />);

    expect(screen.getByText("Pause")).toBeDisabled();
    expect(screen.getByRole("button", { name: /exit debug mode/i })).toHaveTextContent(
      "Exit Debug"
    );
    expect(screen.getByRole("button", { name: /exit debug mode/i })).toBeDisabled();
    expect(screen.getByText(/RVDB command running/i)).toBeInTheDocument();
  });

  it("uses explicit Debug mode labels and exposes execution shortcuts", () => {
    mockActions();
    const emu: MockEmulator = createMockEmulator();
    setStoreState({ status: "ready", emulator: emu });
    render(<ControlBar />);

    expect(screen.getByRole("button", { name: /enter debug mode/i })).toHaveTextContent(
      "Enter Debug"
    );
    expect(screen.getByRole("button", { name: "Run" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Space"
    );
    expect(screen.getByRole("button", { name: "Step" })).toHaveAttribute(
      "aria-keyshortcuts",
      "S"
    );
    expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute(
      "aria-keyshortcuts",
      "R"
    );
  });

  it("Step and Run disabled when halted", () => {
    mockActions();
    const emu: MockEmulator = createMockEmulator();
    setStoreState({ status: "halted", emulator: emu });
    render(<ControlBar />);

    expect(screen.getByText("Run")).toBeDisabled();
    expect(screen.getByText("Step")).toBeDisabled();
    expect(screen.getByText("Reset")).toBeEnabled();
  });

  it("Reset calls store.reset", () => {
    const actions = mockActions();
    const emu: MockEmulator = createMockEmulator();
    setStoreState({ status: "ready", emulator: emu });
    render(<ControlBar />);

    fireEvent.click(screen.getByText("Reset"));
    expect(actions.reset).toHaveBeenCalledOnce();
  });

  it("Speed select calls setSpeed", () => {
    const actions = mockActions();
    render(<ControlBar />);
    const speedSelect = screen.getByLabelText("Speed") as HTMLSelectElement;
    fireEvent.change(speedSelect, { target: { value: "turbo" } });
    expect(actions.setSpeed).toHaveBeenCalledWith("turbo");
  });

  it("shows error box when status is error", () => {
    mockActions();
    setStoreState({ status: "error", error: "kaboom" });
    render(<ControlBar />);
    expect(screen.getByText("kaboom")).toBeInTheDocument();
  });

  it("renders built-in programs when manifest returns entries", async () => {
    mockActions();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ programs: [{ id: "fib", file: "fib.elf", format: "elf" }] }),
        { status: 200 }
      )
    );
    render(<ControlBar />);
    await waitFor(() => expect(screen.getByText("fib")).toBeInTheDocument());
  });

  it("shows pending hint when a file is selected but not loaded", () => {
    mockActions();
    setStoreState({ status: "idle", emulator: null });
    const { container } = render(<ControlBar />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "prog.elf");
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/Selected:.*prog\.elf/i)).toBeInTheDocument();
  });

  it("disables Run/Step/Reset while a selection is pending even if a program is loaded", () => {
    mockActions();
    const emu: MockEmulator = createMockEmulator();
    setStoreState({ status: "ready", emulator: emu });
    const { container } = render(<ControlBar />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "next.elf");
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("Run")).toBeDisabled();
    expect(screen.getByText("Step")).toBeDisabled();
    expect(screen.getByText("Reset")).toBeDisabled();
    // Load remains available
    expect(screen.getByText("Load")).toBeEnabled();
  });
});
