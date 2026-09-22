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
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
};

export const loadBotConfig = (): BotConfig => ({
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  firebaseApiKey: process.env.FIREBASE_API_KEY ?? DEFAULT_FIREBASE_API_KEY,
  gatewayWsUrl: process.env.GATEWAY_WS_URL ?? DEFAULT_GATEWAY_WS_URL,
  botEmail: requireEnv("BOT_EMAIL"),
  botPassword: requireEnv("BOT_PASSWORD"),
  botDisplayName: process.env.BOT_DISPLAY_NAME ?? "Claude",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  turnsPerSession: Math.max(1, Number(process.env.TURNS_PER_SESSION ?? "12")),
  // Gateway allows a burst of 20 commands then refills 5/sec (see
  // apps/realtime-gateway/src/command-rate-limiter) — 4s between decisions
  // is comfortably under that, no special handling needed.
  turnIntervalMs: Math.max(1000, Number(process.env.TURN_INTERVAL_MS ?? "4000"))
});
