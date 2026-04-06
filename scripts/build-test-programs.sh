#!/bin/bash
set -e

CACHED_TOOLCHAIN_BIN="$HOME/.cache/rvemu-web/riscv-toolchain/bin"
RESOURCES_DIR="riscv-emulator/test_resources"
OUTPUT_DIR="public/test-programs"

# Try to find toolchain from PATH first
if command -v riscv64-unknown-elf-gcc &> /dev/null; then
  echo "Found RISC-V toolchain in PATH"
  RV_CC="riscv64-unknown-elf-gcc"
  RV_LD="riscv64-unknown-elf-ld"
  RV_DUMP="riscv64-unknown-elf-objdump"
  RV_OBJCOPY="riscv64-unknown-elf-objcopy"
# Otherwise try cached toolchain
elif [ -d "$CACHED_TOOLCHAIN_BIN" ]; then
  echo "Using cached RISC-V toolchain from $CACHED_TOOLCHAIN_BIN"
  RV_CC="$CACHED_TOOLCHAIN_BIN/riscv64-unknown-elf-gcc"
  RV_LD="$CACHED_TOOLCHAIN_BIN/riscv64-unknown-elf-ld"
  RV_DUMP="$CACHED_TOOLCHAIN_BIN/riscv64-unknown-elf-objdump"
  RV_OBJCOPY="$CACHED_TOOLCHAIN_BIN/riscv64-unknown-elf-objcopy"
else
  echo "Error: RISC-V toolchain not found"
  echo ""
  echo "Please either:"
  echo "  1. Install riscv64-unknown-elf-gcc to your PATH, or"
  echo "  2. Run scripts/download-toolchain.sh to download to cache"
  exit 1
fi

echo "Building test programs..."

# Build test programs
cd "$RESOURCES_DIR"
make clean || true
make \
  RV_CC="$RV_CC" \
  RV_LD="$RV_LD" \
  RV_DUMP="$RV_DUMP" \
  RV_OBJCOPY="$RV_OBJCOPY"

cd ../..

# Copy built ELFs to public directory
mkdir -p "$OUTPUT_DIR"
cp "$RESOURCES_DIR/bin/"*.elf "$OUTPUT_DIR/"

echo ""
echo "Test programs built successfully:"
ls -lh "$OUTPUT_DIR"/*.elf

echo ""
echo "Total: $(ls -1 "$OUTPUT_DIR"/*.elf | wc -l) programs"
