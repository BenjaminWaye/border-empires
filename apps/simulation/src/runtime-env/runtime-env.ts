import { parseSimulationSeedProfile, type SimulationSeedProfile } from "../seed-state/seed-state.js";
import { parseSimulationMapStyle, type SimulationMapStyle, type SimulationRulesetId } from "../season-worldgen/season-worldgen.js";

export type SimulationRuntimeEnv = {
  host: string;
  port: number;
  metricsHost: string;
  metricsPort: number;
  sqlitePath?: string;
  snapshotDir?: string;
  applySchema: boolean;
  checkpointEveryEvents: number;
  checkpointForceAfterEvents: number;
  checkpointMaxRssBytes?: number;
  checkpointMaxHeapUsedBytes?: number;
  startupReplayCompactionMinEvents: number;
  seedProfile: SimulationSeedProfile;
  rulesetId?: SimulationRulesetId;
  mapStyle: SimulationMapStyle;
  aiPlayerCount?: number;
  enableAiAutopilot: boolean;
  aiTickMs: number;
  aiMinCommandIntervalMs: number;
  aiMaxEventLoopLagMs: number;
  enableSystemAutopilot: boolean;
  systemTickMs: number;
  globalStatusBroadcastDebounceMs: number;
  systemPlayerIds?: string[];
  /** Player IDs excluded from all leaderboard surfaces (overall, byTiles, byIncome, byTechs).
   *  Intended for health-check / probe players that should not appear in rankings. */
  nonCompetitivePlayerIds: ReadonlySet<string>;

  startupRecoveryTimeoutMs: number;
  allowSeedRecoveryFallback: boolean;
  requireDurableStartupState?: boolean;
  /** When true, AI/system planning runs in worker threads off the main event loop. */
  useAiWorker: boolean;
  /**
   * Diagnostic experiment flags — for staging investigation only. Each is a
   * no-op in production unless explicitly set.
   *
   * AI_DRY_RUN: AI worker generates decisions but submitCommand is short-
   * circuited to a no-op counter. Isolates planning/serialization cost from
   * action-application/DB/broadcast cost.
   *
   * AI_MAX_COMMANDS_PER_TICK: cap actions submitted per AI tick. 0 = no cap.
   *
   * AI_DISABLE_EXPAND / AI_DISABLE_BUILD: filter specific action types from AI
   * output to isolate which action type is causing load.
   */
  aiDryRun: boolean;
  aiMaxCommandsPerTick: number;
  aiDisableExpand: boolean;
  aiDisableBuild: boolean;
  healthProbeIntervalMs: number;
  healthProbeTimeoutMs: number;
  healthFailureThreshold: number;
};

const parsePositiveNumber = (value: string | undefined, fallback: number, label: string): number => {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid ${label}: ${value ?? ""}`);
  }
  return parsed;
};

// AI/system tick intervals drive continuous, compounding CPU work (player
// export + relevance sync + a worker postMessage round trip, every tick,
// forever) — unlike most env-tunable knobs, an aggressive override here
// doesn't fail fast, it silently taxes every other thread sharing the box's
// CPU. Staging was found running SIMULATION_AI_TICK_MS=25 /
// SIMULATION_SYSTEM_TICK_MS=100 (10x / 5x faster than this file's own
// defaults below) — the AI planner and barbarian producer ticking 40 and 10
// times a second respectively, which is what was actually contending with
// the checkpoint pipeline for CPU, not any single expensive operation.
// Clamp to a floor so a stress-test profile's aggressive value can never
// silently apply to a steady-state deployment.
const parsePositiveNumberWithFloor = (
  value: string | undefined,
  fallback: number,
  floor: number,
  label: string
): number => Math.max(floor, parsePositiveNumber(value, fallback, label));

// AI player count is locked into the save when a season is seeded, so the env
// var is only consulted when bootstrapping a fresh season. Treat 0, empty, or
// malformed values as "no override" rather than crashing — a typo in the env
// var must never brick a running world.
const parseOptionalAiPlayerCount = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[runtime-env] ignoring SIMULATION_AI_PLAYER_COUNT=${value} (must be a positive integer); recovered seasons use the saved roster, fresh seasons fall back to the worldgen default`
    );
    return undefined;
  }
  return Math.floor(parsed);
};

const isManagedRuntimeEnv = (env: NodeJS.ProcessEnv): boolean => {
  const nodeEnv = (env.NODE_ENV ?? "").toLowerCase();
  return nodeEnv === "production" || nodeEnv === "staging" || typeof env.FLY_APP_NAME === "string";
};

const parseBooleanishEnvFlag = (value: string | undefined): boolean => {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export const parseSimulationRuntimeEnv = (env: NodeJS.ProcessEnv): SimulationRuntimeEnv => {
  const sqlitePath = env.SIMULATION_SQLITE_PATH ?? env.SQLITE_PATH;
  const isManagedRuntime = isManagedRuntimeEnv(env);

  if (isManagedRuntime && !sqlitePath) {
    throw new Error("simulation requires SIMULATION_SQLITE_PATH/SQLITE_PATH in managed runtime");
  }
  if (isManagedRuntime && !env.SIMULATION_SEED_PROFILE && !env.SIMULATION_RULESET_ID) {
    throw new Error("simulation requires SIMULATION_SEED_PROFILE or SIMULATION_RULESET_ID in managed runtime");
  }

  const systemPlayerIds = env.SIMULATION_SYSTEM_PLAYER_IDS
    ? env.SIMULATION_SYSTEM_PLAYER_IDS.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined;
  const nonCompetitivePlayerIds = new Set(
    (env.SIMULATION_NON_COMPETITIVE_PLAYER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const checkpointMaxRssMb = env.SIMULATION_CHECKPOINT_MAX_RSS_MB;
  const checkpointMaxHeapUsedMb = env.SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB;
  const allowSeedRecoveryFallback =
    parseBooleanishEnvFlag(env.SIMULATION_ALLOW_SEED_RECOVERY_FALLBACK) &&
    Boolean(env.SIMULATION_SEED_PROFILE);
  const aiPlayerCountHint = parseOptionalAiPlayerCount(env.SIMULATION_AI_PLAYER_COUNT);
  const requireDurableStartupState =
    env.SIMULATION_REQUIRE_DURABLE_STARTUP_STATE === undefined
      ? undefined
      : !["0", "false", "no", "off"].includes(env.SIMULATION_REQUIRE_DURABLE_STARTUP_STATE.trim().toLowerCase());

  return {
    host: env.SIMULATION_HOST ?? "127.0.0.1",
    port: parsePositiveNumber(env.SIMULATION_PORT, 50051, "simulation port"),
    metricsHost: env.SIMULATION_METRICS_HOST ?? (env.SIMULATION_HOST ?? "127.0.0.1"),
    metricsPort: parsePositiveNumber(env.SIMULATION_METRICS_PORT, 50052, "simulation metrics port"),
    ...(sqlitePath ? { sqlitePath } : {}),
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
    seedProfile: parseSimulationSeedProfile(env.SIMULATION_SEED_PROFILE ?? "default"),
    ...(env.SIMULATION_RULESET_ID ? { rulesetId: env.SIMULATION_RULESET_ID as SimulationRulesetId } : {}),
    mapStyle: parseSimulationMapStyle(env.SIMULATION_MAP_STYLE),
    ...(typeof aiPlayerCountHint === "number" ? { aiPlayerCount: aiPlayerCountHint } : {}),
    enableAiAutopilot: parseBooleanishEnvFlag(env.SIMULATION_ENABLE_AI_AUTOPILOT),
    aiTickMs: parsePositiveNumberWithFloor(env.SIMULATION_AI_TICK_MS, 250, 100, "simulation ai tick"),
    aiMinCommandIntervalMs: parsePositiveNumber(
      env.SIMULATION_AI_MIN_COMMAND_INTERVAL_MS,
      1_000,
      "simulation ai min command interval"
    ),
    aiMaxEventLoopLagMs: parsePositiveNumber(
      env.SIMULATION_AI_MAX_EVENT_LOOP_LAG_MS,
      250,
      "simulation ai max event-loop lag"
    ),
    enableSystemAutopilot: parseBooleanishEnvFlag(env.SIMULATION_ENABLE_SYSTEM_AUTOPILOT),
    systemTickMs: parsePositiveNumberWithFloor(env.SIMULATION_SYSTEM_TICK_MS, 500, 200, "simulation system tick"),
    globalStatusBroadcastDebounceMs: parsePositiveNumber(
      env.SIMULATION_GLOBAL_STATUS_BROADCAST_DEBOUNCE_MS,
      15_000,
      "simulation global status broadcast debounce"
    ),
    healthProbeIntervalMs: parsePositiveNumber(
      env.SIMULATION_HEALTH_PROBE_INTERVAL_MS,
      5_000,
      "simulation health probe interval"
    ),
    healthProbeTimeoutMs: parsePositiveNumber(
      env.SIMULATION_HEALTH_PROBE_TIMEOUT_MS,
      2_000,
      "simulation health probe timeout"
    ),
    healthFailureThreshold: parsePositiveNumber(
      env.SIMULATION_HEALTH_FAILURE_THRESHOLD,
      3,
      "simulation health failure threshold"
    ),
    startupRecoveryTimeoutMs: parsePositiveNumber(
      env.SIMULATION_STARTUP_RECOVERY_TIMEOUT_MS,
      120_000,
      "simulation startup recovery timeout"
    ),
    allowSeedRecoveryFallback,
    ...(typeof requireDurableStartupState === "boolean" ? { requireDurableStartupState } : {}),
    useAiWorker: parseBooleanishEnvFlag(env.SIMULATION_AI_WORKER),
    aiDryRun: parseBooleanishEnvFlag(env.SIMULATION_AI_DRY_RUN),
    aiMaxCommandsPerTick: Math.max(
      0,
      Math.floor(Number(env.SIMULATION_AI_MAX_COMMANDS_PER_TICK ?? "0"))
    ),
    aiDisableExpand: parseBooleanishEnvFlag(env.SIMULATION_AI_DISABLE_EXPAND),
    aiDisableBuild: parseBooleanishEnvFlag(env.SIMULATION_AI_DISABLE_BUILD),
    nonCompetitivePlayerIds,
    ...(systemPlayerIds && systemPlayerIds.length > 0 ? { systemPlayerIds } : {})
  };
};
