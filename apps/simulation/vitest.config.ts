import { configDefaults, defineConfig } from "vitest/config";

// Heavy integration tests (startup recovery, AI repair) can hit 5-10 s under
// parallel CPU contention in CI; set a generous default test timeout.
const testTimeout = 10_000;

export default defineConfig({
  test: {
    testTimeout,
    // Perf gates run in their own isolated pass (vitest.perf.config.ts) so
    // parallel-suite CPU contention can't trip their wall-time budgets (#415).
    // The two season-seed-world-*.test.ts files are multi-minute, CPU-bound
    // world-generation stress tests with the same problem: on a 2-vCPU GitHub
    // runner they starve whatever test file the scheduler runs alongside
    // them, which blew the timeout of an unrelated, otherwise-fast test in
    // the same worker on multiple real CI runs (e.g.
    // github.com/BenjaminWaye/border-empires/actions/runs/34681969264 and
    // .../34695673019 — a different victim test each time, confirming it's
    // scheduling contention, not a bug in either test). Bumping this
    // testTimeout further doesn't fix it, since the stress tests' own
    // runtime is itself variable (146s-402s observed) — isolating them
    // (vitest.slow.config.ts, run as its own CI step) is the real fix,
    // mirroring the existing *-perf.test.ts pattern.
    exclude: [
      ...configDefaults.exclude,
      "**/*-perf.test.ts",
      "**/season-seed-world-ring-interiors.test.ts",
      "**/season-seed-world-dock-coverage.test.ts"
    ],
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--expose-gc"]
      }
    }
  }
});
