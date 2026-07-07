import { configDefaults, defineConfig } from "vitest/config";

// Heavy integration tests (startup recovery, AI repair) can hit 5-10 s under
// parallel CPU contention in CI; set a generous default test timeout.
const testTimeout = 10_000;

export default defineConfig({
  test: {
    testTimeout,
    // Perf gates run in their own isolated pass (vitest.perf.config.ts) so
    // parallel-suite CPU contention can't trip their wall-time budgets (#415).
    exclude: [...configDefaults.exclude, "**/*-perf.test.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--expose-gc"]
      }
    }
  }
});
