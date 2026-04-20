import { describe, expect, it } from "vitest";

import { parseSimulationRuntimeEnv } from "./runtime-env.js";

describe("simulation runtime env", () => {
  it("allows local defaults without database configuration", () => {
    expect(parseSimulationRuntimeEnv({})).toEqual({
      host: "127.0.0.1",
      port: 50051,
      applySchema: false,
      checkpointEveryEvents: 5000,
      seedProfile: "default",
      enableAiAutopilot: false,
      aiTickMs: 250,
      enableSystemAutopilot: false,
      systemTickMs: 500,
      globalStatusBroadcastDebounceMs: 15000,
      startupRecoveryTimeoutMs: 15000,
      allowSeedRecoveryFallback: false,
      useAiWorker: false
    });
  });

  it("requires durable database configuration in production", () => {
    expect(() => parseSimulationRuntimeEnv({ NODE_ENV: "production" })).toThrow(
      "simulation requires SIMULATION_DATABASE_URL or DATABASE_URL in production"
    );
  });

  it("parses explicit production configuration", () => {
    expect(
      parseSimulationRuntimeEnv({
        NODE_ENV: "production",
        SIMULATION_HOST: "0.0.0.0",
        SIMULATION_PORT: "50051",
        DATABASE_URL: "postgres://simulation",
        SIMULATION_DB_APPLY_SCHEMA: "1",
        SIMULATION_SNAPSHOT_EVERY_EVENTS: "75",
        SIMULATION_CHECKPOINT_MAX_RSS_MB: "420",
        SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB: "300",
        SIMULATION_SEED_PROFILE: "stress-20ai",
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
      databaseUrl: "postgres://simulation",
      applySchema: true,
      checkpointEveryEvents: 75,
      checkpointMaxRssBytes: 420 * 1024 * 1024,
      checkpointMaxHeapUsedBytes: 300 * 1024 * 1024,
      seedProfile: "stress-20ai",
      enableAiAutopilot: true,
      aiTickMs: 100,
      enableSystemAutopilot: true,
      systemTickMs: 250,
      globalStatusBroadcastDebounceMs: 20000,
      startupRecoveryTimeoutMs: 20000,
      allowSeedRecoveryFallback: false,
      systemPlayerIds: ["barbarian-1", "barbarian-2"],
      useAiWorker: false
    });
  });

  it("enables AI worker when SIMULATION_AI_WORKER=1", () => {
    expect(
      parseSimulationRuntimeEnv({ SIMULATION_AI_WORKER: "1" })
    ).toMatchObject({ useAiWorker: true });
  });

  it("allows seed fallback for non-db local startup only", () => {
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
});
