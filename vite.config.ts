import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

function resolveBasePath(): string {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    return "/";
  }

  const [, repoName] = repo.split("/");
  return repoName ? `/${repoName}/` : "/";
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? resolveBasePath() : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@wasm": resolve(__dirname, "src/wasm-pkg")
    }
  }
});
