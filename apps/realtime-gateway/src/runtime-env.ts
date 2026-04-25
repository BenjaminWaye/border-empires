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
  simulationSeedProfile: SimulationSeedProfile;
  allowNonAuthoritativeInitialState: boolean;
  disableFog: boolean;
};

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid realtime gateway port: ${value ?? ""}`);
  }
  return parsed;
};

const isManagedRuntimeEnv = (env: NodeJS.ProcessEnv): boolean => {
  const nodeEnv = (env.NODE_ENV ?? "").toLowerCase();
  return nodeEnv === "production" || nodeEnv === "staging" || typeof env.FLY_APP_NAME === "string";
};

const parseBinaryFlag = (value: string | undefined): boolean | undefined => {
  if (value === "1") return true;
  if (value === "0") return false;
  return undefined;
};

export const parseRealtimeGatewayRuntimeEnv = (
  env: NodeJS.ProcessEnv
): RealtimeGatewayRuntimeEnv => {
  const databaseUrl = env.GATEWAY_DATABASE_URL ?? env.DATABASE_URL;
  const snapshotDir = env.GATEWAY_SNAPSHOT_DIR;
  const simulationAddress = env.SIMULATION_ADDRESS ?? "127.0.0.1:50051";
  const simulationWakeAddress =
    env.GATEWAY_SIMULATION_WAKE_ADDRESS ??
    (simulationAddress.includes(".internal:") ? simulationAddress.replace(".internal:", ".flycast:") : undefined);
  const isManagedRuntime = isManagedRuntimeEnv(env);
  const allowNonAuthoritativeInitialState =
    parseBinaryFlag(env.GATEWAY_ALLOW_NON_AUTHORITATIVE_INITIAL_STATE) ??
    parseBinaryFlag(env.GATEWAY_ALLOW_SEED_FALLBACK) ??
    !isManagedRuntime;

  if (isManagedRuntime && !databaseUrl) {
    throw new Error("realtime gateway requires GATEWAY_DATABASE_URL or DATABASE_URL in managed runtime");
  }
  if (isManagedRuntime && !env.SIMULATION_ADDRESS) {
    throw new Error("realtime gateway requires SIMULATION_ADDRESS in managed runtime");
  }
  if (isManagedRuntime && !env.SIMULATION_SEED_PROFILE) {
    throw new Error("realtime gateway requires SIMULATION_SEED_PROFILE in managed runtime");
  }

  return {
    host: env.HOST ?? "127.0.0.1",
    port: parsePort(env.PORT, 3101),
    simulationAddress,
    ...(simulationWakeAddress ? { simulationWakeAddress } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(snapshotDir ? { snapshotDir } : {}),
    applySchema: env.GATEWAY_DB_APPLY_SCHEMA === "1",
    ...(env.GATEWAY_DEFAULT_HUMAN_PLAYER_ID
      ? { defaultHumanPlayerId: env.GATEWAY_DEFAULT_HUMAN_PLAYER_ID }
      : !isManagedRuntime
        ? { defaultHumanPlayerId: "player-1" }
        : {}),
    simulationSeedProfile: parseSimulationSeedProfile(env.SIMULATION_SEED_PROFILE),
    allowNonAuthoritativeInitialState,
    disableFog: parseBinaryFlag(env.GATEWAY_DISABLE_FOG) === true
  };
};
