import type { ClientState } from "./client-state.js";
import type { ClientShardRainAlert } from "./client-shard-alert.js";
import type { Tile } from "./client-types.js";

export type ClientShardRainPing = {
  x: number;
  y: number;
  createdAt: number;
  activateAt: number;
};

export const SHARD_RAIN_PING_VISIBLE_MS = 30_000;
export const SHARD_RAIN_PING_FALL_WINDOW_MS = 2 * 60_000;

const isActiveShardFall = (tile: Tile | undefined): boolean => tile?.shardSite?.kind === "FALL" && !tile.fogged;

const pingKeyForTile = (tile: Pick<Tile, "x" | "y">): string => `${tile.x},${tile.y}`;

const shardRainPingFallDelayMs = (x: number, y: number, windowMs: number = SHARD_RAIN_PING_FALL_WINDOW_MS): number => {
  const hash = Math.abs((x * 73_856_093) ^ (y * 19_349_663)) % windowMs;
  return hash;
};

const scheduledActivateAt = (
  alert: ClientShardRainAlert | undefined,
  x: number,
  y: number,
  nowMs: number
): number => {
  if (alert?.phase !== "started") return nowMs;
  return Math.max(nowMs, alert.startsAt + shardRainPingFallDelayMs(x, y));
};

export const maybeRegisterShardRainPing = (
  state: Pick<ClientState, "shardRainPingsByTile" | "shardAlert">,
  previous: Tile | undefined,
  next: Tile,
  nowMs: number = Date.now()
): void => {
  const nextShardSite = next.shardSite;
  if (next.fogged || nextShardSite?.kind !== "FALL") return;
  if (previous?.shardSite?.kind === "FALL" && previous.shardSite.amount === nextShardSite.amount && !previous.fogged) return;
  const tileKey = pingKeyForTile(next);
  const existing = state.shardRainPingsByTile.get(tileKey);
  state.shardRainPingsByTile.set(tileKey, {
    x: next.x,
    y: next.y,
    createdAt: existing?.createdAt ?? nowMs,
    activateAt: existing?.activateAt ?? scheduledActivateAt(state.shardAlert, next.x, next.y, nowMs)
  });
};

export const visibleShardSiteForTile = (
  tile: Tile | undefined,
  shardRainPingsByTile: ReadonlyMap<string, ClientShardRainPing>,
  nowMs: number = Date.now()
): Tile["shardSite"] | undefined => {
  if (!tile?.shardSite || tile.fogged) return undefined;
  if (tile.shardSite.kind !== "FALL") return tile.shardSite;
  const ping = shardRainPingsByTile.get(pingKeyForTile(tile));
  if (!ping) return tile.shardSite;
  return nowMs >= ping.activateAt ? tile.shardSite : undefined;
};

export const tileWithVisibleShardSite = (
  tile: Tile | undefined,
  shardRainPingsByTile: ReadonlyMap<string, ClientShardRainPing>,
  nowMs: number = Date.now()
): Tile | undefined => {
  if (!tile) return undefined;
  const shardSite = visibleShardSiteForTile(tile, shardRainPingsByTile, nowMs);
  if (shardSite === tile.shardSite) return tile;
  return { ...tile, shardSite: shardSite ?? null };
};

export const shardRainPingActiveAt = (
  ping: ClientShardRainPing,
  nowMs: number = Date.now(),
  visibleMs: number = SHARD_RAIN_PING_VISIBLE_MS
): boolean => nowMs >= ping.activateAt && nowMs < ping.activateAt + visibleMs;

export const pruneShardRainPings = (
  state: Pick<ClientState, "tiles" | "shardRainPingsByTile">
): boolean => {
  return pruneExpiredShardRainPings(state, Date.now());
};

export const pruneExpiredShardRainPings = (
  state: Pick<ClientState, "tiles" | "shardRainPingsByTile">,
  _nowMs: number = Date.now(),
  _visibleMs: number = SHARD_RAIN_PING_VISIBLE_MS
): boolean => {
  let changed = false;
  for (const [tileKey] of state.shardRainPingsByTile) {
    if (isActiveShardFall(state.tiles.get(tileKey))) continue;
    state.shardRainPingsByTile.delete(tileKey);
    changed = true;
  }
  return changed;
};
