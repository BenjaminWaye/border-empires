import { describe, expect, it } from "vitest";

import { RuntimeShardRain } from "./runtime-shard-rain-state.js";
import { SHARD_RAIN_TTL_MS } from "./runtime-shard-rain-rules.js";

const createShardRain = () =>
  new RuntimeShardRain({
    state: { players: new Map(), tiles: new Map() },
    now: () => 0,
    replaceTileState: () => undefined,
    emitEvent: () => undefined,
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    territoryTileKeysForPlayer: () => new Set<string>()
  });

describe("RuntimeShardRain", () => {
  it("rebuilds the live wave from recovered FALL sites at boot", () => {
    const rain = createShardRain();
    rain.recordRecoveredFallSite("1,1", 5_000_000);
    rain.recordRecoveredFallSite("2,2", 6_000_000);
    expect(rain.welcomeNotice(1_000)).toEqual({
      type: "SHARD_RAIN_EVENT",
      phase: "started",
      startsAt: 6_000_000 - SHARD_RAIN_TTL_MS,
      expiresAt: 6_000_000,
      siteCount: 2
    });
  });

  it("counts collected sites down without going negative", () => {
    const rain = createShardRain();
    rain.recordRecoveredFallSite("1,1", 5_000_000);
    expect(rain.decrementSiteCount()).toBe(0);
    expect(rain.decrementSiteCount()).toBe(0);
    expect(rain.welcomeNotice(1_000).phase).toBe("upcoming");
  });

  it("announces the next wave once the current one has no expiry", () => {
    const rain = createShardRain();
    rain.recordRecoveredFallSite("1,1", 5_000_000);
    rain.clearExpiry();
    expect(rain.welcomeNotice(1_000).phase).toBe("upcoming");
  });
});
