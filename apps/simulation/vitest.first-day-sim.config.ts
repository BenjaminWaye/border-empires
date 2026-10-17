import { defineConfig } from "vitest/config";

// Opt-in first-day manpower simulation (src/first-day-sim/first-day-sim.sim.ts):
// runs the real SimulationRuntime on a virtual clock for hours of game time,
// so it takes minutes to hours of wall time and never runs in CI. Usage and
// env knobs: docs/agents/topics/agent-gameplay-testing.md. server.deps.external
// and execArgv mirror vitest.config.ts (node:sqlite, --expose-gc); the env
// matches production's EMPIRE_INTEGRITY_ENABLED=true.
export default defineConfig({
  test: {
    include: ["src/first-day-sim/*.sim.ts"],
    testTimeout: 12 * 60 * 60 * 1000,
    env: { EMPIRE_INTEGRITY_ENABLED: "true" },
    server: { deps: { external: [/^node:/] } },
    pool: "forks",
    poolOptions: { forks: { execArgv: ["--expose-gc"] } }
  }
});
