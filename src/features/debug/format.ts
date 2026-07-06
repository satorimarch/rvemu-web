/** Format a bigint as a zero-padded hex string. */
export function hex(value: bigint, width = 16): string {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

/** Format a bigint as decimal. */
export function dec(value: bigint): string {
  return value.toString();
}
