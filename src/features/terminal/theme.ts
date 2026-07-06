/**
 * xterm.js canvas palette — locked to the Instrument design system.
 *
 * xterm renders to a canvas and cannot read CSS custom properties, so the
 * palette is expressed as raw hex literals here. The values mirror the
 * DESIGN.md "Indigo-Slate Steel" scale: Steel Sunken background, Probe Blue
 * cursor, semantic-signal hues for the ANSI 16. Edit here, not in TerminalPanel.
 */

export const XTERM_THEME = {
  background: "#0a0c1a",
  foreground: "#d6deeb",
  cursor: "#58a6ff",
  cursorAccent: "#0a0c1a",
  selectionBackground: "#264f78",
  black: "#0a0c1a",
  red: "#f85149",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#c9d1d9",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79b8ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc"
} as const;

export const XTERM_FONT_FAMILY =
  "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Menlo, Consolas, monospace";

/** Disable the blinking terminal cursor when the user requests reduced motion. */
export function shouldBlinkTerminalCursor(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
