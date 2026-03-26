import { ControlBar } from "@/features/control/ControlBar";
import { StatusPanel } from "@/features/debug/StatusPanel";
import { TerminalPanel } from "@/features/terminal/TerminalPanel";

export default function App() {
  return (
    <div className="app-shell">
      <header className="hero">
        <h1>RVEmu Web</h1>
        <p>RISC-V Full-System Emulator in Browser</p>
      </header>

      <ControlBar />

      <main className="main-grid">
        <StatusPanel />
        <TerminalPanel />
      </main>
    </div>
  );
}
