import { configDefaults, defineConfig } from "vitest/config";

// Node ≥22 built-ins (e.g. node:sqlite, DatabaseSync) need to bypass Vite's
// bundler — Vite doesn't auto-externalize bare "node:*" imports for inline
// dependency processing. Without this, tests that import node:sqlite fail
// with "Failed to load url sqlite (resolved id: sqlite)".
export default defineConfig({
  test: {
    // Perf gates run in their own isolated pass (vitest.perf.config.ts) so
    // parallel-suite CPU contention can't trip their wall-time budgets (#415).
    exclude: [...configDefaults.exclude, "**/*-perf.test.ts"],
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
