import { defineConfig } from "vitest/config";

// Node ≥22 built-ins (e.g. node:sqlite, DatabaseSync) need to bypass Vite's
// bundler — Vite doesn't auto-externalize bare "node:*" imports for inline
// dependency processing. Without this, tests that import node:sqlite fail
// with "Failed to load url sqlite (resolved id: sqlite)".
export default defineConfig({
  test: {
    server: {
      deps: {
        external: [/^node:/]
      }
    },
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--expose-gc"]
      }
    }
  }
});
