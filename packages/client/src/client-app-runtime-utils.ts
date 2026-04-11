import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

export const formatManpowerAmount = (value: number): string => Math.round(value).toString();

export const keyForTile = (x: number, y: number): string => `${x},${y}`;

export const parseTileKey = (key: string): { x: number; y: number } => {
  const [xs, ys] = key.split(",");
  return { x: Number(xs), y: Number(ys) };
};

export const wrapTileX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;

export const wrapTileY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;

export const FULL_MAP_CHUNK_RADIUS = Math.max(Math.ceil(WORLD_WIDTH / CHUNK_SIZE / 2), Math.ceil(WORLD_HEIGHT / CHUNK_SIZE / 2));

export const rateToneClass = (rate: number): string => {
  if (rate > 0.001) return "positive";
  if (rate < -0.001) return "negative";
  return "neutral";
};

export const formatCooldownShort = (remainingMs: number): string => {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
};

export const prettyToken = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
