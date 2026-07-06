import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { useEmulatorStore } from "@/features/emulator/useEmulatorStore";

vi.mock("@/features/control/ControlBar", () => ({
  ControlBar: () => <div>Controls</div>
}));

vi.mock("@/features/debug/DebugPanel", () => ({
  DebugPanel: () => <div>Registers panel</div>
}));

vi.mock("@/features/terminal/TerminalPanel", () => ({
  TerminalPanel: () => <div>UART panel</div>
}));

vi.mock("@/features/terminal/RvdbTerminalPanel", () => ({
  RvdbTerminalPanel: () => <div>RVDB panel</div>
}));

describe("App workspace", () => {
  beforeEach(() => {
    useEmulatorStore.setState({
      mode: "run",
      status: "idle",
      pc: 0n,
      cycles: 0n,
      emulator: null
    });
  });

  it("shows only UART in Run mode and both terminals in Debug mode", () => {
    render(<App />);

    expect(screen.getByText("UART panel")).toBeInTheDocument();
    expect(screen.queryByText("RVDB panel")).not.toBeInTheDocument();
    expect(document.querySelector(".main-grid")).not.toHaveClass("main-grid-debug");

    act(() => useEmulatorStore.setState({ mode: "debug" }));

    expect(screen.getByText("UART panel")).toBeInTheDocument();
    expect(screen.getByText("RVDB panel")).toBeInTheDocument();
    expect(document.querySelector(".main-grid")).toHaveClass("main-grid-debug");
  });

  it("opens shortcut help from a visible trigger and restores focus on close", async () => {
    render(<App />);
    const trigger = screen.getByRole("button", { name: /shortcuts/i });

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close keyboard shortcuts/i }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
