import { parseSimulationSeedProfile, type SimulationSeedProfile } from "../seed-fallback.js";

const DEFAULT_EMAIL_ALERTS_FROM = "Border Empires <alerts@borderempires.com>";
const DEFAULT_EMAIL_ALERTS_APP_URL = "https://staging.borderempires.com";

export type RealtimeGatewayRuntimeEnv = {
  host: string;
  port: number;
  simulationAddress: string;
  simulationWakeAddress?: string;
  sqlitePath?: string;
  snapshotDir?: string;
  applySchema: boolean;
  defaultHumanPlayerId?: string;
  simulationSeedProfile: SimulationSeedProfile;
  allowNonAuthoritativeInitialState: boolean;
  adminApiToken?: string;
  fogAdminEmail?: string;
  emailAlerts: {
    resendApiKey?: string;
    from?: string;
    replyTo?: string;
    appUrl?: string;
    dailyLimit?: number;
  };
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
  const sqlitePath = env.GATEWAY_SQLITE_PATH ?? env.SQLITE_PATH;
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
  const emailAlertsFrom = env.GATEWAY_EMAIL_ALERTS_FROM ?? DEFAULT_EMAIL_ALERTS_FROM;
  const emailAlertsAppUrl = env.GATEWAY_EMAIL_ALERTS_APP_URL ?? env.PUBLIC_APP_URL ?? DEFAULT_EMAIL_ALERTS_APP_URL;

  // GATEWAY_DEFAULT_HUMAN_PLAYER_ID collapses every distinct authenticated Firebase
  // uid without an explicit binding onto a single shared playerId. That is only ever
  // safe for local single-player dev, where there is one real user. In a managed
  // runtime (staging/production) with multiple real accounts, honoring a stray/leaked
  // secret here silently merges unrelated users' identities onto the same player.
  // Require a second, explicit opt-in flag before this can take effect in a managed
  // runtime, so a lone misconfigured secret can never reproduce that collision again.
  const allowDefaultHumanPlayerIdInManagedRuntime =
    parseBinaryFlag(env.GATEWAY_ALLOW_DEFAULT_HUMAN_PLAYER_ID_IN_MANAGED_RUNTIME) === true;
  if (isManagedRuntime && env.GATEWAY_DEFAULT_HUMAN_PLAYER_ID && !allowDefaultHumanPlayerIdInManagedRuntime) {
    console.warn(
      "[runtime-env] ignoring GATEWAY_DEFAULT_HUMAN_PLAYER_ID in managed runtime: set " +
        "GATEWAY_ALLOW_DEFAULT_HUMAN_PLAYER_ID_IN_MANAGED_RUNTIME=1 if this is intentional"
    );
  }

  if (isManagedRuntime && !sqlitePath) {
    throw new Error("realtime gateway requires GATEWAY_SQLITE_PATH/SQLITE_PATH in managed runtime");
  }
  if (isManagedRuntime && !env.SIMULATION_ADDRESS) {
    throw new Error("realtime gateway requires SIMULATION_ADDRESS in managed runtime");
  }
  if (isManagedRuntime && !env.SIMULATION_SEED_PROFILE && !env.SIMULATION_RULESET_ID) {
    throw new Error("realtime gateway requires SIMULATION_SEED_PROFILE or SIMULATION_RULESET_ID in managed runtime");
  }

  return {
    host: env.HOST ?? "127.0.0.1",
    port: parsePort(env.PORT, 3101),
    simulationAddress,
    ...(simulationWakeAddress ? { simulationWakeAddress } : {}),
    ...(sqlitePath ? { sqlitePath } : {}),
    ...(snapshotDir ? { snapshotDir } : {}),
    applySchema: env.GATEWAY_DB_APPLY_SCHEMA === "1",
    ...(env.GATEWAY_DEFAULT_HUMAN_PLAYER_ID && (!isManagedRuntime || allowDefaultHumanPlayerIdInManagedRuntime)
      ? { defaultHumanPlayerId: env.GATEWAY_DEFAULT_HUMAN_PLAYER_ID }
      : !isManagedRuntime
        ? { defaultHumanPlayerId: "player-1" }
        : {}),
    simulationSeedProfile: parseSimulationSeedProfile(env.SIMULATION_SEED_PROFILE ?? "default"),
    allowNonAuthoritativeInitialState,
    ...(env.ADMIN_API_TOKEN ? { adminApiToken: env.ADMIN_API_TOKEN } : {}),
    fogAdminEmail: (env.FOG_ADMIN_EMAIL ?? "bw199005@gmail.com").trim().toLowerCase(),
    emailAlerts: {
      ...(env.GATEWAY_EMAIL_ALERTS_RESEND_API_KEY ? { resendApiKey: env.GATEWAY_EMAIL_ALERTS_RESEND_API_KEY } : {}),
      from: emailAlertsFrom,
      ...(env.GATEWAY_EMAIL_ALERTS_REPLY_TO ? { replyTo: env.GATEWAY_EMAIL_ALERTS_REPLY_TO } : {}),
      appUrl: emailAlertsAppUrl,
      ...(env.GATEWAY_EMAIL_ALERTS_DAILY_LIMIT ? { dailyLimit: Number(env.GATEWAY_EMAIL_ALERTS_DAILY_LIMIT) } : {})
    }
  };
};
