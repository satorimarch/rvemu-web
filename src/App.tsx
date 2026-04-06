import { ControlBar } from "@/features/control/ControlBar";
import { StatusPanel } from "@/features/debug/StatusPanel";
import { TerminalPanel } from "@/features/terminal/TerminalPanel";

export default function App() {
  return (
    <div className="app-shell">
      <header className="hero">
        <h1>RISC-V Emulator Online</h1>
        <div className="hero-subline">
          <p>RISC-V Full-System Emulator in Browser</p>
          <span className="hero-divider" aria-hidden="true">•</span>
          <a
            className="project-link"
            href="https://github.com/WanDejun/riscv-emulator"
            target="_blank"
            rel="noreferrer"
          >
            Core: riscv-emulator
          </a>
        </div>
      </header>

      <ControlBar />

      <main className="main-grid">
        <StatusPanel />
        <TerminalPanel />
      </main>
    </div>
  );
}
