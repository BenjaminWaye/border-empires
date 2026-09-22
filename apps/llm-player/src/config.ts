// Standalone bot config, meant to run from a developer's own machine against
// a real deployed environment (staging by default) — never from server infra.
// All secrets come from a local .env (gitignored); see .env.example.

export type BotConfig = {
  anthropicApiKey: string;
  firebaseApiKey: string;
  gatewayWsUrl: string;
  botEmail: string;
  botPassword: string;
  botDisplayName: string;
  discordWebhookUrl: string | undefined;
  turnsPerSession: number;
  turnIntervalMs: number;
};

// Public web API key baked into the shipped client bundle (see
// packages/client/src/client-app-runtime-env/client-app-runtime-env.ts) —
// not a secret, safe to default here so a fresh checkout works without
// hunting for it. Override via FIREBASE_API_KEY if the project ever rotates.
const DEFAULT_FIREBASE_API_KEY = "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";
const DEFAULT_GATEWAY_WS_URL = "wss://border-empires-combined-staging.fly.dev/ws";

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
};

// Number(...) on a malformed value (e.g. a typo like "12 turns") returns
// NaN, which Math.max/min silently propagate rather than reject -- fail
// loudly instead of running a 0-turn session with no error.
const parsePositiveInt = (name: string, raw: string | undefined, fallback: number, min: number): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`Invalid ${name}="${raw}" — expected a number >= ${min}.`);
  }
  return Math.floor(value);
};

export const loadBotConfig = (): BotConfig => ({
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  firebaseApiKey: process.env.FIREBASE_API_KEY ?? DEFAULT_FIREBASE_API_KEY,
  gatewayWsUrl: process.env.GATEWAY_WS_URL ?? DEFAULT_GATEWAY_WS_URL,
  botEmail: requireEnv("BOT_EMAIL"),
  botPassword: requireEnv("BOT_PASSWORD"),
  botDisplayName: process.env.BOT_DISPLAY_NAME ?? "Claude",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  turnsPerSession: parsePositiveInt("TURNS_PER_SESSION", process.env.TURNS_PER_SESSION, 12, 1),
  // Gateway allows a burst of 20 commands then refills 5/sec (see
  // apps/realtime-gateway/src/command-rate-limiter) — 4s between decisions
  // is comfortably under that, no special handling needed.
  turnIntervalMs: parsePositiveInt("TURN_INTERVAL_MS", process.env.TURN_INTERVAL_MS, 4000, 1000)
});
