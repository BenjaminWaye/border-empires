import { defineConfig } from "vitest/config";

// Perf gates (*-perf.test.ts) run in their own isolated pass so parallel-suite
// CPU contention can't trip the wall-time budgets (issue #415). fileParallelism
// false runs the perf files one at a time, each with the whole machine.
// server.deps.external + execArgv are duplicated from vitest.config.ts because
// node:sqlite externalization and --expose-gc are needed here too.
export default defineConfig({
  test: {
    include: ["**/*-perf.test.ts"],
    fileParallelism: false,
    // Run with EMPIRE_INTEGRITY_ENABLED=true so the cachedEconomySnapshot
    // cold-cache path (which reads defensibilityMetricsCacheByPlayer) is covered.
    // pool:forks ensures env is set before any module-level constants are loaded.
    env: {
      EMPIRE_INTEGRITY_ENABLED: "true"
    },
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
