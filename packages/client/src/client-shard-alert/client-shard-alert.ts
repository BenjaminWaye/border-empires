import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

export type ClientShardRainAlert =
  | { key: string; phase: "upcoming"; startsAt: number }
  | { key: string; phase: "started"; startsAt: number; expiresAt: number; siteCount: number; sites?: { x: number; y: number }[] };

const pluralize = (value: number, unit: string): string => `${value} ${unit}${value === 1 ? "" : "s"}`;

export const formatShardRainRemaining = (ms: number): string => {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return pluralize(totalMinutes, "minute");
  if (minutes === 0) return pluralize(hours, "hour");
  return `${pluralize(hours, "hour")} ${pluralize(minutes, "minute")}`;
};

export const shardRainAlertDetail = (alert: ClientShardRainAlert, nowMs: number): string => {
  if (alert.phase === "upcoming") {
    return `Shard rain will begin in ${formatShardRainRemaining(alert.startsAt - nowMs)}.`;
  }
  return `Shard rain has begun. ${alert.siteCount} impact site${alert.siteCount === 1 ? "" : "s"} will remain for ${formatShardRainRemaining(alert.expiresAt - nowMs)}.`;
};

// Shortest signed offset from a to b on a wrapped (toroidal) axis of the
// given size — e.g. on a 450-wide world, a=10, b=440 is 20 tiles away going
// the "backward" way around, not 430 tiles forward.
const wrappedDelta = (a: number, b: number, size: number): number => {
  const raw = b - a;
  if (raw > size / 2) return raw - size;
  if (raw < -size / 2) return raw + size;
  return raw;
};

const COMPASS_POINTS = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"] as const;
export type CompassDirection = (typeof COMPASS_POINTS)[number];

// World y grows downward (south), matching screen/minimap coordinates, so
// north is the -y direction.
export const compassDirectionFor = (dx: number, dy: number): CompassDirection => {
  const angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const normalized = (angleDeg + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 45) % 8]!;
};

export type ShardSiteBearing = { distanceTiles: number; compass: CompassDirection };

// Nearest FALL site to `origin` (typically the player's home tile), with
// wraparound-aware distance/direction — undefined when there's nothing to
// point at (no origin, or the alert carries no site coordinates, which
// happens for the "hello" notice sent to players who reconnect mid-rain).
export const nearestShardSiteBearing = (
  sites: { x: number; y: number }[] | undefined,
  origin: { x: number; y: number } | undefined
): ShardSiteBearing | undefined => {
  if (!sites || sites.length === 0 || !origin) return undefined;
  let best: ShardSiteBearing | undefined;
  let bestDistSq = Infinity;
  for (const site of sites) {
    const dx = wrappedDelta(origin.x, site.x, WORLD_WIDTH);
    const dy = wrappedDelta(origin.y, site.y, WORLD_HEIGHT);
    const distSq = dx * dx + dy * dy;
    if (distSq >= bestDistSq) continue;
    bestDistSq = distSq;
    best = { distanceTiles: Math.round(Math.sqrt(distSq)), compass: compassDirectionFor(dx, dy) };
  }
  return best;
};

export const formatShardSiteBearing = (bearing: ShardSiteBearing | undefined): string => {
  if (!bearing) return "";
  if (bearing.distanceTiles === 0) return "Nearest site is right on your capital.";
  return `Nearest site is ~${bearing.distanceTiles} tiles ${bearing.compass}.`;
};

// Compact countdown line for a persistent panel (as opposed to the one-time
// alert overlay above). Returns "" when there is nothing to show so callers
// can omit the note line entirely.
export const formatShardRainCountdown = (alert: ClientShardRainAlert | undefined, nowMs: number): string => {
  if (!alert) return "";
  if (alert.phase === "started") {
    const remaining = alert.expiresAt - nowMs;
    if (remaining <= 0) return "";
    return `Shard rain active — ${alert.siteCount} site${alert.siteCount === 1 ? "" : "s"} — ${formatShardRainRemaining(remaining)} left`;
  }
  const remaining = alert.startsAt - nowMs;
  if (remaining <= 0) return "";
  return `Next shard rain in ${formatShardRainRemaining(remaining)}`;
};
