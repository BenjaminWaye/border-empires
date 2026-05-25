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
      aiMaxEventLoopLagMs: 250,
      enableSystemAutopilot: false,
      systemTickMs: 500,
      globalStatusBroadcastDebounceMs: 15000,
      healthProbeIntervalMs: 5000,
      healthProbeTimeoutMs: 2000,
      healthFailureThreshold: 3,
      startupRecoveryTimeoutMs: 120000,
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
});
