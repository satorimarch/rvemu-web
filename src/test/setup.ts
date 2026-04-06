import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => {
  setTimeout(cb, 16);
  return 1;
});

global.cancelAnimationFrame = vi.fn();

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = vi.fn();
}

// Mock TextEncoder/TextDecoder if not available
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = class TextEncoder {
    encode(str: string): Uint8Array {
      return new Uint8Array(Buffer.from(str, "utf-8"));
    }
  } as any;
}

if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = class TextDecoder {
    decode(arr: Uint8Array): string {
      return Buffer.from(arr).toString("utf-8");
    }
  } as any;
}
