import { defineConfig } from "vitest/config";

// Multi-minute, CPU-bound world-generation stress tests run in their own
// isolated pass, same rationale and pattern as vitest.perf.config.ts (#415):
// on a constrained CI runner these starve whatever test file the scheduler
// happens to run alongside them, tripping that unrelated test's own timeout
// (a different victim each run — confirmed scheduling contention, not a bug
// in either test). fileParallelism false runs them one at a time, each with
// the whole machine. server.deps.external + execArgv are duplicated from
// vitest.config.ts because node:sqlite externalization and --expose-gc are
// needed here too.
export default defineConfig({
  test: {
    include: [
      "**/season-seed-world-ring-interiors.test.ts",
      "**/season-seed-world-dock-coverage.test.ts"
    ],
    fileParallelism: false,
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
