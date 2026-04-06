# AGENTS.md - Developer Guide for AI Coding Agents

This file contains essential information for AI coding agents working on the rvemu-web codebase.

## Project Overview

**RVEmu-Web** is a web frontend for the RISC-V emulator, enabling full-system emulation directly in the browser.

### Architecture

- **Backend**: This project is a **web wrapper** for `riscv-emulator` (Git submodule in `riscv-emulator/`)
- **Core Emulator**: Written in **Rust**, implements a complete RISC-V RV64 instruction set emulator
- **Compilation**: The Rust emulator is compiled to **WebAssembly** using `wasm-pack`
- **Execution**: The entire emulator **runs completely in the frontend** - no backend server required
- **UI**: React + TypeScript interface provides controls, terminal, and debug views

### Technology Stack

- **Frontend Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand
- **WASM**: Rust → wasm-pack → WebAssembly
- **Terminal UI**: xterm.js
- **Deployment**: GitHub Pages (static site)

### Project Relationship

```
riscv-emulator (Rust)          →  Compile with wasm-pack  →  WebAssembly
       ↓                                                             ↓
  Git Submodule                                              src/wasm-pkg/
       ↓                                                             ↓
riscv-emulator/                                            Frontend loads WASM
  ├── src/ (Rust source)                                          ↓
  ├── Cargo.toml                                          Runs in Browser
  └── test_resources/                                    (No backend needed)
```

**Key Points:**
- This repo (`rvemu-web`) does NOT contain the emulator logic itself
- Emulator logic is in the `riscv-emulator` submodule (Rust codebase)
- Changes to emulator require editing Rust code and rebuilding WASM
- This project only handles UI, state management, and WASM integration

## Build & Development Commands

### Core Commands
```bash
# Development server with hot reload
npm run dev

# Build for production (TypeScript compilation + Vite build)
npm run build

# Preview production build locally
npm run preview

# Build WASM module from Rust source
npm run wasm:build

# Build test programs (requires RISC-V toolchain)
npm run test-programs:build
```

### Type Checking
```bash
# Type check without emitting files
npx tsc --noEmit

# Build TypeScript (used in build script)
npx tsc -b
```

### Test Programs

The project includes built-in RISC-V test programs that are compiled during CI/CD:

- **Source**: Located in `riscv-emulator/test_resources/src/`
- **Programs**: `fib`, `prime`, `matrix_mul`, `io_bench`, `clint`, `float`, `ecall_test`, `interrupt_test`, `trap_test`, `virtio_blk_test`, `main`
- **Toolchain**: Uses `riscv64-unknown-elf-gcc` (downloaded in CI, or use system-installed)
- **Output**: ELF files are bundled in `public/test-programs/` during build
- **User Experience**: Users can select and load built-in programs without uploading files

**To build locally:**
```bash
# Option 1: Use system-installed toolchain (if available in PATH)
npm run test-programs:build

# Option 2: Download toolchain to cache (CI approach)
bash scripts/download-toolchain.sh
npm run test-programs:build
```

**Note**: Built-in programs are only available in production (GitHub Pages). In local dev, the UI gracefully hides the built-in programs section if test programs haven't been built.

### Testing
**Note**: This project currently has no test suite configured. When adding tests:
- Consider using Vitest (already compatible with Vite)
- For single test: `npx vitest run path/to/test.spec.ts`
- For watch mode: `npx vitest watch path/to/test.spec.ts`

## Code Style Guidelines

### Imports
- Use path aliases: `@/` for `src/` and `@wasm/` for `src/wasm-pkg/`
- Group imports: React/external libraries first, then internal imports
- Use named imports for components and utilities
- Import types with `type` keyword when possible:
  ```typescript
  import type { WasmEmulator } from "./wasmTypes";
  ```

**Example:**
```typescript
import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { useEmulatorStore } from "@/features/emulator/useEmulatorStore";
import type { WasmEmulator } from "@/features/emulator/wasmTypes";
```

### TypeScript Types
- **Strict mode enabled**: All strict TypeScript checks are enforced
- Use explicit return types for exported functions
- Prefer `interface` for object types that may be extended
- Use `type` for unions, primitives, and utility types
- Use `bigint` for 64-bit values from WASM (registers, PC, cycles)
- Avoid `any` - use `unknown` and type guards if necessary

**Examples:**
```typescript
// Prefer interface for extendable objects
interface WasmEmulator {
  step(): void;
  clock_cycles(): bigint;
}

// Use type for unions and non-extendable structures
type ProgramFormat = "elf" | "bin";
type EmulatorState = {
  emulator: WasmEmulator | null;
  loading: boolean;
};

// Explicit function return types
function hex(value: bigint, width = 16): string {
  return `0x${value.toString(16).padStart(width, "0")}`;
}
```

### Naming Conventions
- **Components**: PascalCase (e.g., `ControlBar`, `StatusPanel`)
- **Files**: Match component name (e.g., `ControlBar.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useEmulatorStore`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `REG_COUNT`)
- **Enums**: PascalCase for enum name and values (e.g., `EmulatorStatus.Running`)
- **Variables/Functions**: camelCase (e.g., `loadProgram`, `pushUartInput`)
- **Types/Interfaces**: PascalCase (e.g., `WasmEmulator`, `ProgramFormat`)

### Formatting
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Double quotes for strings
- **Semicolons**: Required at end of statements
- **Line length**: No strict limit, but keep readable (typically < 100 chars)
- **Trailing commas**: Not required but acceptable in multiline structures
- **Arrow functions**: Prefer for inline callbacks and React components

### React Conventions
- Use function components (no class components)
- Export component as named export at bottom or inline:
  ```typescript
  export function ComponentName() { ... }
  ```
- Destructure props in function signature
- Use `const` for component definitions when using arrow functions
- Prefer `useEffect` cleanup functions for subscriptions
- Use `useMemo` for expensive computations
- Store refs with `useRef` and proper typing:
  ```typescript
  const termRef = useRef<Terminal | null>(null);
  ```

### State Management (Zustand)
- Create stores with `create<StateType>()`
- Define complete state type including actions
- Use functional updates `set((state) => ...)` when depending on previous state
- Access state with selectors: `useEmulatorStore((s) => s.property)`
- Use `get()` inside store actions to access current state

**Example:**
```typescript
export const useEmulatorStore = create<EmulatorState>((set, get) => ({
  emulator: null,
  loading: false,
  
  loadProgram: async (file, format) => {
    set({ loading: true });
    const bytes = new Uint8Array(await file.arrayBuffer());
    set({ emulator: createEmulator(bytes), loading: false });
  }
}));
```

### Error Handling
- Use try-catch for async operations and WASM calls
- Store errors in state for UI display
- Convert errors to strings safely:
  ```typescript
  error: error instanceof Error ? error.message : String(error)
  ```
- Provide user-friendly error messages
- Clean up state on errors (e.g., stop animations, reset flags)

### Comments
- Use TSDoc comments for exported functions/types
- Inline comments for complex logic only
- Prefer self-documenting code over excessive comments
- Explain "why" not "what" in comments

### File Organization
```
src/
├── features/           # Feature-based modules
│   ├── control/       # Control bar UI
│   ├── debug/         # Debug/status panel
│   ├── emulator/      # Core emulator logic & state
│   └── terminal/      # Terminal UI
├── styles/            # Global CSS
├── wasm/              # WASM type definitions
├── wasm-pkg/          # Generated WASM output (gitignored)
├── App.tsx            # Root component
└── main.tsx           # Entry point
```

## Key Patterns & Practices

1. **BigInt for WASM values**: All 64-bit values from WASM use `bigint` type
2. **TextEncoder/Decoder**: Use for UART I/O between JS and WASM
3. **Animation frames**: Use `requestAnimationFrame` for emulator loop, store ID for cleanup
4. **Cleanup**: Always cancel animation frames and dispose resources in useEffect returns
5. **Non-null assertions**: Use `!` sparingly, only when certain (e.g., `document.getElementById("root")!`)
6. **Async/await**: Prefer over promises for better readability

## Common Operations

### Adding a new feature module
1. Create folder under `src/features/[feature-name]/`
2. Add component file: `FeatureName.tsx`
3. Export named component
4. Import in parent with path alias: `@/features/[feature-name]/FeatureName`

### Working with the emulator state
```typescript
// Read state
const { emulator, loading } = useEmulatorStore();

// Read specific value (optimized re-renders)
const pc = useEmulatorStore((s) => s.pc);

// Call action
const loadProgram = useEmulatorStore((s) => s.loadProgram);
```

### WASM Integration
- WASM module is lazy-loaded via `wasmLoader.ts`
- All WASM types defined in `wasmTypes.ts`
- WASM binary stored in `src/wasm-pkg/` (generated, not committed)

## Notes for AI Agents

- **No linter configured**: Follow TypeScript strict mode and conventions above
- **No formatter configured**: Maintain consistency with existing code style
- **No test framework**: When writing tests, propose setup first
- **Path aliases required**: Always use `@/` and `@wasm/` aliases, not relative paths for src imports
- **WASM build**: Run `npm run wasm:build` after changing Rust code in `riscv-emulator/` submodule
- **Git submodule**: The `riscv-emulator/` directory is a git submodule, handle with care

## Additional Context

This codebase was primarily generated by ChatGPT with minimal manual audit. When making changes:
- Verify TypeScript compiles without errors
- Test in browser (npm run dev) to ensure runtime correctness
- Maintain existing architectural patterns
- Keep code simple and readable
