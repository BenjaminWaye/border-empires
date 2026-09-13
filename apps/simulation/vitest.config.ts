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
    // world-generation stress tests with the same problem, isolated the same
    // way (vitest.slow.config.ts, run as its own CI step).
    exclude: [
      ...configDefaults.exclude,
      "**/*-perf.test.ts",
      "**/season-seed-world-ring-interiors.test.ts",
      "**/season-seed-world-dock-coverage.test.ts"
    ],
    // singleFork: real CI runs (github.com/BenjaminWaye/border-empires/
    // actions/runs/34681969264, .../34695673019, .../34715318283) each timed
    // out a *different*, otherwise-fast test immediately after a heavy
    // world-gen test (season-seed-world-determinism.test.ts,
    // simulation-service tests booting real seed profiles) — moving,
    // excluding, or individually re-timing the heavy tests one at a time
    // never converged; a new victim kept appearing. Per-test timeout bumps
    // for two specific tests fixed those two but not a third. Root cause:
    // vitest's default fork pool reuses a small number of OS-process workers
    // across many test files on a CPU-constrained GitHub runner; a file that
    // does real synchronous world generation leaves that worker's V8 heap
    // under enough GC pressure (see the app's own gc_pause_detected
    // diagnostic) that whatever test file runs next in the *same* worker can
    // stall past its own timeout, regardless of that test's own cost.
    // singleFork forces every file through one worker, one at a time, so a
    // heavy file's teardown/GC always fully settles before the next file
    // starts -- trading overall suite wall-time for determinism, which is
    // the right trade for a required CI gate.
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--expose-gc"],
        singleFork: true
      }
    }
  }
});
