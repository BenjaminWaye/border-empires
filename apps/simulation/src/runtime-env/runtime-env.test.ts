import { describe, expect, it } from "vitest";

import { parseSimulationRuntimeEnv } from "./runtime-env.js";

describe("simulation runtime env", () => {
  it("allows local defaults without database configuration", () => {
    expect(parseSimulationRuntimeEnv({})).toEqual({
      host: "127.0.0.1",
      port: 50051,
      metricsHost: "127.0.0.1",
      metricsPort: 50052,
      applySchema: false,
      checkpointEveryEvents: 5000,
      checkpointForceAfterEvents: 20000,
      startupReplayCompactionMinEvents: 10000,
      seedProfile: "default",
      mapStyle: "continents",
      enableAiAutopilot: false,
      aiTickMs: 250,
      aiMinCommandIntervalMs: 1000,
      aiMaxCommandsPerTick: 0,
      aiDryRun: false,
      aiDisableBuild: false,
      aiDisableExpand: false,
      aiMaxEventLoopLagMs: 250,
      enableSystemAutopilot: false,
      systemTickMs: 500,
      globalStatusBroadcastDebounceMs: 15000,
      healthProbeIntervalMs: 5000,
      healthProbeTimeoutMs: 2000,
      healthFailureThreshold: 3,
      startupRecoveryTimeoutMs: 120000,
      nonCompetitivePlayerIds: new Set(),
      allowSeedRecoveryFallback: false,
      useAiWorker: false
    });
  });

  it("requires durable database configuration in managed runtime", () => {
    expect(() => parseSimulationRuntimeEnv({ NODE_ENV: "production" })).toThrow(
      "simulation requires SIMULATION_SQLITE_PATH/SQLITE_PATH in managed runtime"
    );
  });

  it("parses explicit production configuration", () => {
    expect(
      parseSimulationRuntimeEnv({
        NODE_ENV: "production",
        SIMULATION_HOST: "0.0.0.0",
        SIMULATION_PORT: "50051",
        SIMULATION_METRICS_HOST: "0.0.0.0",
        SIMULATION_METRICS_PORT: "5100",
        SQLITE_PATH: "/data/simulation.db",
        SIMULATION_DB_APPLY_SCHEMA: "1",
        SIMULATION_SNAPSHOT_EVERY_EVENTS: "75",
        SIMULATION_CHECKPOINT_FORCE_AFTER_EVENTS: "420",
        SIMULATION_CHECKPOINT_MAX_RSS_MB: "420",
        SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB: "300",
        SIMULATION_SEED_PROFILE: "stress-20ai",
        SIMULATION_MAP_STYLE: "islands",
        SIMULATION_ENABLE_AI_AUTOPILOT: "1",
        SIMULATION_AI_TICK_MS: "100",
        SIMULATION_AI_MIN_COMMAND_INTERVAL_MS: "5000",
        SIMULATION_ENABLE_SYSTEM_AUTOPILOT: "1",
        SIMULATION_SYSTEM_TICK_MS: "250",
        SIMULATION_GLOBAL_STATUS_BROADCAST_DEBOUNCE_MS: "20000",
        SIMULATION_SYSTEM_PLAYER_IDS: "barbarian-1, barbarian-2",
        SIMULATION_STARTUP_RECOVERY_TIMEOUT_MS: "20000",
        SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK: "1"
      })
    ).toEqual({
      host: "0.0.0.0",
      port: 50051,
      metricsHost: "0.0.0.0",
      metricsPort: 5100,
      sqlitePath: "/data/simulation.db",
      applySchema: true,
      checkpointEveryEvents: 75,
      checkpointForceAfterEvents: 420,
      startupReplayCompactionMinEvents: 10000,
      checkpointMaxRssBytes: 420 * 1024 * 1024,
      checkpointMaxHeapUsedBytes: 300 * 1024 * 1024,
      seedProfile: "stress-20ai",
      mapStyle: "islands",
      enableAiAutopilot: true,
      aiTickMs: 100,
      aiMinCommandIntervalMs: 5000,
      aiMaxCommandsPerTick: 0,
      aiDryRun: false,
      aiDisableBuild: false,
      aiDisableExpand: false,
      aiMaxEventLoopLagMs: 250,
      enableSystemAutopilot: true,
      systemTickMs: 250,
      globalStatusBroadcastDebounceMs: 20000,
      healthProbeIntervalMs: 5000,
      healthProbeTimeoutMs: 2000,
      healthFailureThreshold: 3,
      startupRecoveryTimeoutMs: 20000,
      allowSeedRecoveryFallback: true,
      systemPlayerIds: ["barbarian-1", "barbarian-2"],
      nonCompetitivePlayerIds: new Set(),
      useAiWorker: false
    });
  });

  it("requires explicit seed profile in managed runtime", () => {
    expect(
      () =>
        parseSimulationRuntimeEnv({
          NODE_ENV: "staging",
          SQLITE_PATH: "/data/simulation.db"
        })
    ).toThrow("simulation requires SIMULATION_SEED_PROFILE or SIMULATION_RULESET_ID in managed runtime");
  });

  it("enables AI worker when SIMULATION_AI_WORKER=1", () => {
    expect(
      parseSimulationRuntimeEnv({ SIMULATION_AI_WORKER: "1" })
    ).toMatchObject({ useAiWorker: true });
  });

  it("falls back to continent map style for unknown selector values", () => {
    expect(parseSimulationRuntimeEnv({ SIMULATION_MAP_STYLE: "unknown" })).toMatchObject({ mapStyle: "continents" });
  });

  it("treats booleanish autopilot env values as enabled", () => {
    expect(
      parseSimulationRuntimeEnv({
        SIMULATION_ENABLE_AI_AUTOPILOT: " true ",
        SIMULATION_ENABLE_SYSTEM_AUTOPILOT: "on",
        SIMULATION_AI_WORKER: " yes "
      })
    ).toMatchObject({
      enableAiAutopilot: true,
      enableSystemAutopilot: true,
      useAiWorker: true
    });
  });

  it("allows seed fallback for local startup when explicitly requested", () => {
    expect(
      parseSimulationRuntimeEnv({
        SIMULATION_SEED_PROFILE: "season-20ai",
        SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK: "1"
      })
    ).toMatchObject({
      seedProfile: "season-20ai",
      allowSeedRecoveryFallback: true
    });
  });

  it("allows seed fallback in managed runtime only when explicitly requested", () => {
    expect(
      parseSimulationRuntimeEnv({
        NODE_ENV: "staging",
        SQLITE_PATH: "/data/simulation.db",
        SIMULATION_SEED_PROFILE: "season-20ai",
        SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK: "1"
      })
    ).toMatchObject({
      allowSeedRecoveryFallback: true
    });
  });

  it("uses a positive SIMULATION_AI_PLAYER_COUNT as a fresh-season hint", () => {
    expect(
      parseSimulationRuntimeEnv({ SIMULATION_AI_PLAYER_COUNT: "5" })
    ).toMatchObject({ aiPlayerCount: 5 });
  });

  it("treats SIMULATION_AI_PLAYER_COUNT=0 as no override instead of crashing", () => {
    const env = parseSimulationRuntimeEnv({ SIMULATION_AI_PLAYER_COUNT: "0" });
    expect(env.aiPlayerCount).toBeUndefined();
  });

  it("ignores malformed SIMULATION_AI_PLAYER_COUNT instead of crashing", () => {
    const env = parseSimulationRuntimeEnv({ SIMULATION_AI_PLAYER_COUNT: "not-a-number" });
    expect(env.aiPlayerCount).toBeUndefined();
  });

  it("allows explicitly disabling durable startup for local seeded db runs", () => {
    expect(
      parseSimulationRuntimeEnv({
        SQLITE_PATH: "/data/simulation.db",
        SIMULATION_SEED_PROFILE: "season-20ai",
        SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK: "1",
        SIMULATION_REQUIRE_DURABLE_STARTUP_STATE: "0"
      })
    ).toMatchObject({
      allowSeedRecoveryFallback: true,
      requireDurableStartupState: false
    });
  });

  it("parses SIMULATION_NON_COMPETITIVE_PLAYER_IDS into a set", () => {
    const env = parseSimulationRuntimeEnv({
      SIMULATION_NON_COMPETITIVE_PLAYER_IDS: "probe-uid-1, probe-uid-2"
    });
    expect(env.nonCompetitivePlayerIds).toEqual(new Set(["probe-uid-1", "probe-uid-2"]));
  });

  it("handles empty SIMULATION_NON_COMPETITIVE_PLAYER_IDS as an empty set", () => {
    const env = parseSimulationRuntimeEnv({});
    expect(env.nonCompetitivePlayerIds).toEqual(new Set());
    expect(env.nonCompetitivePlayerIds.size).toBe(0);
  });

  it("trims whitespace around non-competitive player IDs", () => {
    const env = parseSimulationRuntimeEnv({
      SIMULATION_NON_COMPETITIVE_PLAYER_IDS: "  probe-uid-1 , probe-uid-2  "
    });
    expect(env.nonCompetitivePlayerIds).toEqual(new Set(["probe-uid-1", "probe-uid-2"]));
  });

  it("clamps SIMULATION_AI_TICK_MS / SIMULATION_SYSTEM_TICK_MS to a floor instead of applying an aggressive override verbatim", () => {
    // Found live on staging: SIMULATION_AI_TICK_MS=25 / SIMULATION_SYSTEM_TICK_MS=100
    // (10x / 5x faster than this file's own defaults) drove continuous,
    // compounding CPU load from the AI planner and barbarian producer ticking
    // 40 and 10 times a second — contending with every other thread on a
    // shared-cpu box for no gameplay benefit. A misconfigured env value must
    // never silently apply below the floor.
    const env = parseSimulationRuntimeEnv({
      SIMULATION_AI_TICK_MS: "25",
      SIMULATION_SYSTEM_TICK_MS: "100"
    });
    expect(env.aiTickMs).toBe(100);
    expect(env.systemTickMs).toBe(200);
  });

  it("still allows a moderately faster tick interval above the floor", () => {
    const env = parseSimulationRuntimeEnv({
      SIMULATION_AI_TICK_MS: "150",
      SIMULATION_SYSTEM_TICK_MS: "300"
    });
    expect(env.aiTickMs).toBe(150);
    expect(env.systemTickMs).toBe(300);
  });
});
