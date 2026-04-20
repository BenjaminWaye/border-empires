import { parseSimulationSeedProfile, type SimulationSeedProfile } from "./seed-fallback.js";

export type RealtimeGatewayRuntimeEnv = {
  host: string;
  port: number;
  simulationAddress: string;
  databaseUrl?: string;
  snapshotDir?: string;
  applySchema: boolean;
  defaultHumanPlayerId?: string;
  simulationSeedProfile?: SimulationSeedProfile;
  runtimeIdentity?: {
    sourceType: "legacy-snapshot" | "seed-profile";
    seasonId: string;
    worldSeed: number;
    fingerprint: string;
    snapshotLabel?: string;
    seedProfile?: string;
    playerCount: number;
    seededTileCount: number;
  };
};
type RuntimeSourceType = "legacy-snapshot" | "seed-profile";

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid realtime gateway port: ${value ?? ""}`);
  }
  return parsed;
};

export const parseRealtimeGatewayRuntimeEnv = (
  env: NodeJS.ProcessEnv
): RealtimeGatewayRuntimeEnv => {
  const databaseUrl = env.GATEWAY_DATABASE_URL ?? env.DATABASE_URL;
  const simulationAddress = env.SIMULATION_ADDRESS ?? "127.0.0.1:50051";
  const isProduction = env.NODE_ENV === "production";

  if (isProduction && !databaseUrl) {
    throw new Error("realtime gateway requires GATEWAY_DATABASE_URL or DATABASE_URL in production");
  }
  if (isProduction && !env.SIMULATION_ADDRESS) {
    throw new Error("realtime gateway requires SIMULATION_ADDRESS in production");
  }
  const runtimeSeasonId = env.GATEWAY_RUNTIME_SEASON_ID;
  const runtimeSourceType = env.GATEWAY_RUNTIME_SOURCE_TYPE;
  const runtimeWorldSeed = env.GATEWAY_RUNTIME_WORLD_SEED;
  const runtimeFingerprint = env.GATEWAY_RUNTIME_FINGERPRINT;
  const runtimePlayerCount = env.GATEWAY_RUNTIME_PLAYER_COUNT;
  const runtimeSeededTileCount = env.GATEWAY_RUNTIME_SEEDED_TILE_COUNT;
  const parseRuntimeSourceType = (value: string): RuntimeSourceType => {
    if (value === "legacy-snapshot" || value === "seed-profile") return value;
    throw new Error(`invalid gateway runtime source type: ${value}`);
  };
  const parsePositiveNumber = (value: string | undefined, fallback: number, label: string): number => {
    const parsed = Number(value ?? String(fallback));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`invalid ${label}: ${value ?? ""}`);
    }
    return parsed;
  };
  const runtimeIdentity =
    runtimeSeasonId &&
    runtimeSourceType &&
    runtimeWorldSeed &&
    runtimeFingerprint &&
    runtimePlayerCount &&
    runtimeSeededTileCount
      ? {
          sourceType: parseRuntimeSourceType(runtimeSourceType),
          seasonId: runtimeSeasonId,
          worldSeed: parsePositiveNumber(runtimeWorldSeed, 0, "gateway runtime world seed"),
          fingerprint: runtimeFingerprint,
          playerCount: parsePositiveNumber(runtimePlayerCount, 0, "gateway runtime player count"),
          seededTileCount: parsePositiveNumber(runtimeSeededTileCount, 0, "gateway runtime seeded tile count"),
          ...(env.GATEWAY_RUNTIME_SNAPSHOT_LABEL ? { snapshotLabel: env.GATEWAY_RUNTIME_SNAPSHOT_LABEL } : {}),
          ...(env.GATEWAY_RUNTIME_SEED_PROFILE ? { seedProfile: env.GATEWAY_RUNTIME_SEED_PROFILE } : {})
        }
      : undefined;

  return {
    host: env.HOST ?? "127.0.0.1",
    port: parsePort(env.PORT, 3101),
    simulationAddress,
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(env.GATEWAY_SNAPSHOT_DIR ? { snapshotDir: env.GATEWAY_SNAPSHOT_DIR } : {}),
    applySchema: env.GATEWAY_DB_APPLY_SCHEMA === "1",
    ...(env.GATEWAY_DEFAULT_HUMAN_PLAYER_ID
      ? { defaultHumanPlayerId: env.GATEWAY_DEFAULT_HUMAN_PLAYER_ID }
      : !isProduction
        ? { defaultHumanPlayerId: "player-1" }
        : {}),
    ...(!isProduction || env.SIMULATION_SEED_PROFILE
      ? { simulationSeedProfile: parseSimulationSeedProfile(env.SIMULATION_SEED_PROFILE) }
      : {}),
    ...(runtimeIdentity ? { runtimeIdentity } : {})
  };
};
