#!/bin/bash
set -e

TOOLCHAIN_URL="https://github.com/riscv-collab/riscv-gnu-toolchain/releases/download/2026.03.28/riscv64-elf-ubuntu-24.04-gcc.tar.xz"
CACHE_DIR="$HOME/.cache/rvemu-web/riscv-toolchain"

if [ -d "$CACHE_DIR/bin" ]; then
  echo "Toolchain already cached at $CACHE_DIR"
  exit 0
fi

echo "Downloading RISC-V toolchain..."
mkdir -p "$CACHE_DIR"
cd "$CACHE_DIR"

curl -L "$TOOLCHAIN_URL" | tar -xJ --strip-components=1

echo "Toolchain installed to $CACHE_DIR"

# Add to PATH for subsequent steps in GitHub Actions
if [ -n "$GITHUB_PATH" ]; then
  echo "$CACHE_DIR/bin" >> "$GITHUB_PATH"
fi

echo "Toolchain setup complete"
ls -lh "$CACHE_DIR/bin" | head -10
