import { parseSimulationSeedProfile, type SimulationSeedProfile } from "./seed-fallback.js";

export type RealtimeGatewayRuntimeEnv = {
  host: string;
  port: number;
  simulationAddress: string;
  simulationWakeAddress?: string;
  databaseUrl?: string;
  snapshotDir?: string;
  applySchema: boolean;
  defaultHumanPlayerId?: string;
  simulationSeedProfile?: SimulationSeedProfile;
};

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
  const simulationWakeAddress =
    env.GATEWAY_SIMULATION_WAKE_ADDRESS ??
    (simulationAddress.includes(".internal:") ? simulationAddress.replace(".internal:", ".flycast:") : undefined);
  const isProduction = env.NODE_ENV === "production";

  if (isProduction && !databaseUrl) {
    throw new Error("realtime gateway requires GATEWAY_DATABASE_URL or DATABASE_URL in production");
  }
  if (isProduction && !env.SIMULATION_ADDRESS) {
    throw new Error("realtime gateway requires SIMULATION_ADDRESS in production");
  }

  return {
    host: env.HOST ?? "127.0.0.1",
    port: parsePort(env.PORT, 3101),
    simulationAddress,
    ...(simulationWakeAddress ? { simulationWakeAddress } : {}),
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
      : {})
  };
};
