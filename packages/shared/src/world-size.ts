declare const process: {
  env: {
    WORLD_WIDTH?: string;
    WORLD_HEIGHT?: string;
    WATCHTOWERS_ENABLED?: string;
  };
};

// Per-environment override: the WORLD_WIDTH / WORLD_HEIGHT env vars (server
// runtime; client build-time via vite.config.ts `define`) shrink the map for
// one environment (staging) without touching prod. Unset or invalid values
// fall back to the defaults. Server and client MUST be built with the same
// pair or tile coordinates will not line up.
export const DEFAULT_WORLD_WIDTH = 640;
export const DEFAULT_WORLD_HEIGHT = 320;
const worldDimensionFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 64 && parsed <= 2048 ? parsed : fallback;
};
export const WORLD_WIDTH = worldDimensionFromEnv(process.env["WORLD_WIDTH"], DEFAULT_WORLD_WIDTH);
export const WORLD_HEIGHT = worldDimensionFromEnv(process.env["WORLD_HEIGHT"], DEFAULT_WORLD_HEIGHT);
// Set WATCHTOWERS_ENABLED=false to generate no watchtower sites at all.
export const WATCHTOWERS_ENABLED = process.env["WATCHTOWERS_ENABLED"] !== "false";
