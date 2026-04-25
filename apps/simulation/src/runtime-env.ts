import { parseSimulationSeedProfile, type SimulationSeedProfile } from "./seed-state.js";

export type SimulationRuntimeEnv = {
  host: string;
  port: number;
  metricsHost: string;
  metricsPort: number;
  databaseUrl?: string;
  snapshotDir?: string;
  applySchema: boolean;
  checkpointEveryEvents: number;
  checkpointForceAfterEvents: number;
  checkpointMaxRssBytes?: number;
  checkpointMaxHeapUsedBytes?: number;
  startupReplayCompactionMinEvents: number;
  seedProfile: SimulationSeedProfile;
  enableAiAutopilot: boolean;
  aiTickMs: number;
  aiMaxEventLoopLagMs: number;
  enableSystemAutopilot: boolean;
  systemTickMs: number;
  globalStatusBroadcastDebounceMs: number;
  systemPlayerIds?: string[];
  startupRecoveryTimeoutMs: number;
  allowSeedRecoveryFallback: boolean;
  /** When true, AI/system planning runs in worker threads off the main event loop. */
  useAiWorker: boolean;
  disableFog: boolean;
};

const parsePositiveNumber = (value: string | undefined, fallback: number, label: string): number => {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid ${label}: ${value ?? ""}`);
  }
  return parsed;
};

const isManagedRuntimeEnv = (env: NodeJS.ProcessEnv): boolean => {
  const nodeEnv = (env.NODE_ENV ?? "").toLowerCase();
  return nodeEnv === "production" || nodeEnv === "staging" || typeof env.FLY_APP_NAME === "string";
};

export const parseSimulationRuntimeEnv = (env: NodeJS.ProcessEnv): SimulationRuntimeEnv => {
  const databaseUrl = env.SIMULATION_DATABASE_URL ?? env.DATABASE_URL;
  const isManagedRuntime = isManagedRuntimeEnv(env);

  if (isManagedRuntime && !databaseUrl) {
    throw new Error("simulation requires SIMULATION_DATABASE_URL or DATABASE_URL in managed runtime");
  }
  if (isManagedRuntime && !env.SIMULATION_SEED_PROFILE) {
    throw new Error("simulation requires SIMULATION_SEED_PROFILE in managed runtime");
  }

  const systemPlayerIds = env.SIMULATION_SYSTEM_PLAYER_IDS
    ? env.SIMULATION_SYSTEM_PLAYER_IDS.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined;
  const checkpointMaxRssMb = env.SIMULATION_CHECKPOINT_MAX_RSS_MB;
  const checkpointMaxHeapUsedMb = env.SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB;
  const allowSeedRecoveryFallback =
    !isManagedRuntime &&
    env.SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK === "1" &&
    !databaseUrl;

  return {
    host: env.SIMULATION_HOST ?? "127.0.0.1",
    port: parsePositiveNumber(env.SIMULATION_PORT, 50051, "simulation port"),
    metricsHost: env.SIMULATION_METRICS_HOST ?? (env.SIMULATION_HOST ?? "127.0.0.1"),
    metricsPort: parsePositiveNumber(env.SIMULATION_METRICS_PORT, 50052, "simulation metrics port"),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(env.SIMULATION_SNAPSHOT_DIR ? { snapshotDir: env.SIMULATION_SNAPSHOT_DIR } : {}),
    applySchema: env.SIMULATION_DB_APPLY_SCHEMA === "1",
    checkpointEveryEvents: parsePositiveNumber(
      env.SIMULATION_SNAPSHOT_EVERY_EVENTS,
      5000,
      "simulation snapshot interval"
    ),
    checkpointForceAfterEvents: parsePositiveNumber(
      env.SIMULATION_CHECKPOINT_FORCE_AFTER_EVENTS,
      20_000,
      "simulation checkpoint force-after-events"
    ),
    startupReplayCompactionMinEvents: parsePositiveNumber(
      env.SIMULATION_STARTUP_REPLAY_COMPACTION_MIN_EVENTS,
      10_000,
      "simulation startup replay compaction threshold"
    ),
    ...(checkpointMaxRssMb
      ? { checkpointMaxRssBytes: parsePositiveNumber(checkpointMaxRssMb, 0, "simulation checkpoint rss limit") * 1024 * 1024 }
      : {}),
    ...(checkpointMaxHeapUsedMb
      ? {
          checkpointMaxHeapUsedBytes:
            parsePositiveNumber(checkpointMaxHeapUsedMb, 0, "simulation checkpoint heap-used limit") * 1024 * 1024
        }
      : {}),
    seedProfile: parseSimulationSeedProfile(env.SIMULATION_SEED_PROFILE),
    enableAiAutopilot: env.SIMULATION_ENABLE_AI_AUTOPILOT === "1",
    aiTickMs: parsePositiveNumber(env.SIMULATION_AI_TICK_MS, 250, "simulation ai tick"),
    aiMaxEventLoopLagMs: parsePositiveNumber(
      env.SIMULATION_AI_MAX_EVENT_LOOP_LAG_MS,
      250,
      "simulation ai max event-loop lag"
    ),
    enableSystemAutopilot: env.SIMULATION_ENABLE_SYSTEM_AUTOPILOT === "1",
    systemTickMs: parsePositiveNumber(env.SIMULATION_SYSTEM_TICK_MS, 500, "simulation system tick"),
    globalStatusBroadcastDebounceMs: parsePositiveNumber(
      env.SIMULATION_GLOBAL_STATUS_BROADCAST_DEBOUNCE_MS,
      15_000,
      "simulation global status broadcast debounce"
    ),
    startupRecoveryTimeoutMs: parsePositiveNumber(
      env.SIMULATION_STARTUP_RECOVERY_TIMEOUT_MS,
      120_000,
      "simulation startup recovery timeout"
    ),
    allowSeedRecoveryFallback,
    useAiWorker: env.SIMULATION_AI_WORKER === "1",
    disableFog: env.SIMULATION_DISABLE_FOG === "1",
    ...(systemPlayerIds && systemPlayerIds.length > 0 ? { systemPlayerIds } : {})
  };
};
