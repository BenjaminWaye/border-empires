import { configDefaults, defineConfig } from "vitest/config";

// Heavy integration tests (startup recovery, AI repair) can hit 5-10 s under
// parallel CPU contention in CI; set a generous default test timeout. Bumped
// from 10s after two multi-minute world-generation stress tests
// (season-seed-world-ring-interiors.test.ts, season-seed-world-dock-coverage.test.ts)
// were added — they leave the same worker under enough contention that the
// very next test in that worker (e.g. simulation-service.startup-ai-repair.test.ts)
// blew the old 10s budget on GitHub's runner, confirmed on a real CI run
// (github.com/BenjaminWaye/border-empires/actions/runs/34681969264) with no
// code change of its own — a timing artifact, not a real regression.
const testTimeout = 30_000;

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
