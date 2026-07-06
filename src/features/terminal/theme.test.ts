import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldBlinkTerminalCursor } from "@/features/terminal/theme";

describe("shouldBlinkTerminalCursor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables cursor blinking when reduced motion is requested", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    expect(shouldBlinkTerminalCursor()).toBe(false);
  });

  it("keeps cursor blinking when reduced motion is not requested", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    expect(shouldBlinkTerminalCursor()).toBe(true);
  });
});
