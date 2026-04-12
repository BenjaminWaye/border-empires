import { describe, expect, it } from "vitest";

import {
  SHARD_RAIN_PING_FALL_WINDOW_MS,
  SHARD_RAIN_PING_VISIBLE_MS,
  maybeRegisterShardRainPing,
  pruneExpiredShardRainPings,
  pruneShardRainPings,
  shardRainPingActiveAt,
  visibleShardSiteForTile
} from "./client-shard-rain-pings.js";
import type { ClientShardRainAlert } from "./client-shard-alert.js";
import type { Tile } from "./client-types.js";

const fallTile = (overrides: Partial<Tile> = {}): Tile => ({
  x: 12,
  y: 34,
  terrain: "LAND",
  fogged: false,
  shardSite: { kind: "FALL", amount: 1 },
  ...overrides
});

const createState = (alert?: ClientShardRainAlert) =>
  ({
    shardRainPingsByTile: new Map<string, { x: number; y: number; createdAt: number; activateAt: number }>(),
    shardAlert: alert,
    tiles: new Map<string, Tile>()
  }) as const;

describe("client shard rain pings", () => {
  it("registers a ping only for newly seen shardfall tiles", () => {
    const state = createState({ key: "started:1", phase: "started", startsAt: 1_000, expiresAt: 60_000, siteCount: 4 });
    const tile = fallTile();

    maybeRegisterShardRainPing(state, undefined, tile, 1_000);
    maybeRegisterShardRainPing(state, tile, tile, 1_500);
    maybeRegisterShardRainPing(state, undefined, fallTile({ x: 20, y: 4, fogged: true }), 2_000);

    const ping = state.shardRainPingsByTile.get("12,34");
    expect(ping).toMatchObject({
      x: 12,
      y: 34,
      createdAt: 1_000
    });
    expect(ping!.activateAt).toBeGreaterThanOrEqual(1_000);
    expect(ping!.activateAt).toBeLessThan(1_000 + SHARD_RAIN_PING_FALL_WINDOW_MS);
    expect(state.shardRainPingsByTile.size).toBe(1);
  });

  it("keeps a ping for 30 seconds after its scheduled minimap reveal", () => {
    const state = createState({ key: "started:1", phase: "started", startsAt: 10_000, expiresAt: 90_000, siteCount: 4 });
    const tile = fallTile();
    state.tiles.set("12,34", tile);
    maybeRegisterShardRainPing(state, undefined, tile, 12_000);

    const ping = state.shardRainPingsByTile.get("12,34");
    expect(ping).toBeDefined();
    expect(shardRainPingActiveAt(ping!, ping!.activateAt)).toBe(true);
    expect(shardRainPingActiveAt(ping!, ping!.activateAt + SHARD_RAIN_PING_VISIBLE_MS - 1)).toBe(true);
    expect(shardRainPingActiveAt(ping!, ping!.activateAt + SHARD_RAIN_PING_VISIBLE_MS)).toBe(false);
    expect(pruneExpiredShardRainPings(state, ping!.activateAt + SHARD_RAIN_PING_VISIBLE_MS - 1)).toBe(false);
    expect(state.shardRainPingsByTile.has("12,34")).toBe(true);

    expect(visibleShardSiteForTile(tile, state.shardRainPingsByTile, ping!.activateAt - 1)).toBeUndefined();
    expect(visibleShardSiteForTile(tile, state.shardRainPingsByTile, ping!.activateAt)).toEqual(tile.shardSite);
    expect(visibleShardSiteForTile(tile, state.shardRainPingsByTile, ping!.activateAt + SHARD_RAIN_PING_VISIBLE_MS + 5_000)).toEqual(tile.shardSite);
    expect(state.shardRainPingsByTile.has("12,34")).toBe(true);
  });

  it("drops pings once the shardfall disappears", () => {
    const state = createState();
    const tile = fallTile();
    state.tiles.set("12,34", tile);
    maybeRegisterShardRainPing(state, undefined, tile, 1_000);

    state.tiles.set("12,34", { ...tile, shardSite: null });

    expect(pruneShardRainPings(state)).toBe(true);
    expect(state.shardRainPingsByTile.size).toBe(0);
  });
});
