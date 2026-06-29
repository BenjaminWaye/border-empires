import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "@border-empires/shared";
import type { RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import {
  SHARD_RAIN_COMMAND_ID_PREFIX,
  SHARD_RAIN_SITE_MAX,
  SHARD_RAIN_SITE_MIN,
  SHARD_RAIN_SYSTEM_PLAYER_ID,
  SHARD_RAIN_TTL_MS,
  canHostShardFallSiteAt,
  computeShardRainNotice,
  isScheduledShardRainMinute,
  shouldBroadcastShardRainWarningAt
} from "./runtime-shard-rain-rules.js";

export type ShardRainRuntimeInput = {
  now: () => number;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  recentShardRainTileKeys: Set<string>;
  // Index of currently active FALL shard sites — avoids O(202k) full-tile scan
  // in expireShardFallSites. Populated by spawnShardRain, cleared on expiry.
  activeShardFallSiteKeys: Set<string>;
  lastShardRainHelloByPlayer: Map<string, number>;
  getCurrentShardRainExpiresAt: () => number | undefined;
  setCurrentShardRainExpiresAt: (expiresAt: number | undefined) => void;
  getCurrentShardRainSiteCount: () => number;
  setCurrentShardRainSiteCount: (siteCount: number) => void;
  getLastShardRainSpawnSlotKey: () => string | undefined;
  setLastShardRainSpawnSlotKey: (slotKey: string | undefined) => void;
  getLastShardRainWarningSlotKey: () => string | undefined;
  setLastShardRainWarningSlotKey: (slotKey: string | undefined) => void;
  incrementShardRainTickCounter: () => number;
  replaceTileState: (tileKey: string, tile: DomainTileState) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
};

export const tickShardRain = (input: ShardRainRuntimeInput, nowMs: number): void => {
  expireShardFallSites(input, nowMs);
  maybeBroadcastShardRainWarning(input, nowMs);
  maybeSpawnScheduledShardRain(input, nowMs);
};

export const emitShardRainHelloFor = (input: ShardRainRuntimeInput, playerId: string, nowMs: number): void => {
  const player = input.players.get(playerId);
  if (!player) return;
  if (player.id === SHARD_RAIN_SYSTEM_PLAYER_ID) return;
  if (player.id.startsWith("barbarian-")) return;
  if (player.isAi) return;
  const notice = computeShardRainNotice({
    nowMs,
    currentSiteCount: input.getCurrentShardRainSiteCount(),
    currentExpiresAt: input.getCurrentShardRainExpiresAt()
  });
  if (!notice) return;
  const dedupKey = notice.phase === "started" ? (notice.expiresAt as number) : (notice.startsAt as number);
  if (input.lastShardRainHelloByPlayer.get(playerId) === dedupKey) return;
  input.lastShardRainHelloByPlayer.set(playerId, dedupKey);
  input.emitEvent({
    eventType: "PLAYER_MESSAGE",
    commandId: nextShardRainCommandId(input, "hello"),
    playerId,
    messageType: "SHARD_RAIN_EVENT",
    payloadJson: JSON.stringify(notice)
  });
};

const nextShardRainCommandId = (input: ShardRainRuntimeInput, label: string): string => {
  const counter = input.incrementShardRainTickCounter();
  return `${SHARD_RAIN_COMMAND_ID_PREFIX}:${label}:${counter}:${input.now()}`;
};

const broadcastShardRainNotice = (input: ShardRainRuntimeInput, payload: Record<string, unknown>): void => {
  const commandId = nextShardRainCommandId(input, "notice");
  const payloadJson = JSON.stringify(payload);
  for (const player of input.players.values()) {
    if (player.id === SHARD_RAIN_SYSTEM_PLAYER_ID) continue;
    if (player.id.startsWith("barbarian-")) continue;
    if (player.isAi) continue;
    input.emitEvent({
      eventType: "PLAYER_MESSAGE",
      commandId,
      playerId: player.id,
      messageType: "SHARD_RAIN_EVENT",
      payloadJson
    });
  }
};

const maybeBroadcastShardRainWarning = (input: ShardRainRuntimeInput, nowMs: number): void => {
  const warning = shouldBroadcastShardRainWarningAt(nowMs);
  if (!warning) return;
  if (input.getLastShardRainWarningSlotKey() === warning.slotKey) return;
  input.setLastShardRainWarningSlotKey(warning.slotKey);
  broadcastShardRainNotice(input, { type: "SHARD_RAIN_EVENT", phase: "upcoming", startsAt: warning.nextStart });
};

const maybeSpawnScheduledShardRain = (input: ShardRainRuntimeInput, nowMs: number): void => {
  const scheduled = isScheduledShardRainMinute(nowMs);
  if (!scheduled) return;
  if (input.getLastShardRainSpawnSlotKey() === scheduled.slotKey) return;
  input.setLastShardRainSpawnSlotKey(scheduled.slotKey);
  spawnShardRain(input, nowMs);
};

const spawnShardRain = (input: ShardRainRuntimeInput, nowMs: number): void => {
  const count = SHARD_RAIN_SITE_MIN + Math.floor(Math.random() * (SHARD_RAIN_SITE_MAX - SHARD_RAIN_SITE_MIN + 1));
  const expiresAt = nowMs + SHARD_RAIN_TTL_MS;
  const startsAt = nowMs;
  const placed: { tileKey: string; tile: DomainTileState }[] = [];
  let attempts = 0;
  while (placed.length < count && attempts < count * 300) {
    attempts += 1;
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const tileKey = simulationTileKey(x, y);
    const tile = input.tiles.get(tileKey);
    if (!canHostShardFallSiteAt(tile, tileKey, input.recentShardRainTileKeys)) continue;
    if (!tile) continue;
    const amount = Math.random() > 0.8 ? 2 : 1;
    const updated: DomainTileState = { ...tile, shardSite: { kind: "FALL", amount, expiresAt } };
    input.replaceTileState(tileKey, updated);
    input.recentShardRainTileKeys.add(tileKey);
    input.activeShardFallSiteKeys.add(tileKey);
    placed.push({ tileKey, tile: updated });
  }
  if (placed.length === 0) return;
  const currentExpiresAt = input.getCurrentShardRainExpiresAt();
  input.setCurrentShardRainExpiresAt(typeof currentExpiresAt === "number" ? Math.max(currentExpiresAt, expiresAt) : expiresAt);
  input.setCurrentShardRainSiteCount(input.getCurrentShardRainSiteCount() + placed.length);
  const commandId = nextShardRainCommandId(input, "spawn");
  input.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId,
    playerId: SHARD_RAIN_SYSTEM_PLAYER_ID,
    tileDeltas: placed.map((entry) => input.tileDeltaFromState(entry.tile))
  });
  broadcastShardRainNotice(input, {
    type: "SHARD_RAIN_EVENT",
    phase: "started",
    startsAt,
    expiresAt,
    siteCount: placed.length,
    sites: placed.map((entry) => ({ x: entry.tile.x, y: entry.tile.y }))
  });
};

const expireShardFallSites = (input: ShardRainRuntimeInput, nowMs: number): void => {
  if (input.activeShardFallSiteKeys.size === 0) return;
  const expired: { tileKey: string; tile: DomainTileState }[] = [];
  for (const tileKey of input.activeShardFallSiteKeys) {
    const tile = input.tiles.get(tileKey);
    const site = tile?.shardSite;
    if (!site || site.kind !== "FALL") {
      input.activeShardFallSiteKeys.delete(tileKey);
      continue;
    }
    if (typeof site.expiresAt !== "number" || site.expiresAt > nowMs) continue;
    const updated: DomainTileState = { ...tile, shardSite: undefined };
    input.replaceTileState(tileKey, updated);
    input.activeShardFallSiteKeys.delete(tileKey);
    expired.push({ tileKey, tile: updated });
  }
  if (expired.length === 0) return;
  const siteCount = Math.max(0, input.getCurrentShardRainSiteCount() - expired.length);
  input.setCurrentShardRainSiteCount(siteCount);
  if (siteCount === 0) {
    input.setCurrentShardRainExpiresAt(undefined);
    input.lastShardRainHelloByPlayer.clear();
  }
  const commandId = nextShardRainCommandId(input, "expire");
  input.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId,
    playerId: SHARD_RAIN_SYSTEM_PLAYER_ID,
    tileDeltas: expired.map((entry) => ({ ...input.tileDeltaFromState(entry.tile), shardSiteJson: "" }))
  });
};
