import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { RuntimeShardRain } from "../runtime-shard-rain-state.js";
import type { RuntimePlayer } from "../runtime-types.js";
import {
  COMEBACK_PEAK_HALF_LIFE_MS,
  TerritoryPeakTracker,
  comebackSiteBudget,
  pickComebackPlayers,
  pickComebackTileKey
} from "./shard-rain-comeback.js";

const HOUR = 60 * 60_000;
// An hour before the 08:00 scheduled rain on 2026-10-23.
// Local-time dates: the rain schedule reads getHours(), which is UTC only on the servers.
const BEFORE_RAIN = new Date(2026, 9, 23, 7, 0, 0).getTime();
const RAIN_AT = new Date(2026, 9, 23, 8, 0, 0).getTime();

describe("TerritoryPeakTracker", () => {
  it("reports the share of a recent peak that was lost", () => {
    const peaks = new TerritoryPeakTracker();
    peaks.observe("p1", 200, 0);
    peaks.observe("p1", 50, HOUR);
    expect(peaks.lossFraction("p1", 50, HOUR)).toBeCloseTo(0.75, 1);
  });

  it("lets an old loss fade: the peak halves every half-life", () => {
    const peaks = new TerritoryPeakTracker();
    peaks.observe("p1", 200, 0);
    expect(peaks.lossFraction("p1", 100, COMEBACK_PEAK_HALF_LIFE_MS)).toBeCloseTo(0, 5);
  });

  it("ignores empires that never grew past the minimum peak", () => {
    const peaks = new TerritoryPeakTracker();
    peaks.observe("p1", 12, 0);
    expect(peaks.lossFraction("p1", 1, 0)).toBe(0);
  });

  it("forgives land the player gave up themselves", () => {
    const peaks = new TerritoryPeakTracker();
    peaks.observe("p1", 100, 0);
    peaks.forgive("p1", 45, 0);
    expect(peaks.lossFraction("p1", 55, 0)).toBe(0);
  });

  it("reports no loss for a growing empire and drops departed players", () => {
    const peaks = new TerritoryPeakTracker();
    peaks.observe("p1", 100, 0);
    peaks.observe("p1", 150, HOUR);
    expect(peaks.lossFraction("p1", 150, HOUR)).toBe(0);
    peaks.observe("gone", 100, 0);
    peaks.prune((playerId) => playerId === "p1");
    expect(peaks.size).toBe(1);
  });
});

describe("pickComebackPlayers", () => {
  it("only picks players at or above the loss threshold, each at most once", () => {
    const picked = pickComebackPlayers(
      [
        { playerId: "steady", lossFraction: 0.1 },
        { playerId: "beaten", lossFraction: 0.8 },
        { playerId: "routed", lossFraction: 0.95 }
      ],
      5
    );
    expect([...picked].sort()).toEqual(["beaten", "routed"]);
  });

  it("weights the draw by how much land was lost", () => {
    const candidates = [
      { playerId: "half", lossFraction: 0.5 },
      { playerId: "most", lossFraction: 1 }
    ];
    // A roll in the first third of the total weight (0.5 / 1.5) picks "half".
    expect(pickComebackPlayers(candidates, 1, () => 0.3)).toEqual(["half"]);
    expect(pickComebackPlayers(candidates, 1, () => 0.4)).toEqual(["most"]);
  });

  it("caps a rain's comeback sites at half its sites, rounded up", () => {
    expect(comebackSiteBudget(3)).toBe(2);
    expect(comebackSiteBudget(6)).toBe(3);
  });
});

const landTile = (x: number, y: number, ownerId?: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ...(ownerId ? { ownerId, ownershipState: "SETTLED" } : {}) }) as DomainTileState;

describe("pickComebackTileKey", () => {
  it("skips tiles that cannot host a site or are no longer the player's", () => {
    const tiles = new Map<string, DomainTileState>([
      ["1,1", { ...landTile(1, 1, "p1"), town: {} } as DomainTileState],
      ["2,2", landTile(2, 2, "rival")],
      ["3,3", landTile(3, 3, "p1")]
    ]);
    const canHost = (tile: DomainTileState | undefined) => Boolean(tile && !tile.town);
    expect(pickComebackTileKey("p1", new Set(["1,1", "2,2", "3,3"]), tiles, canHost)).toBe("3,3");
    expect(pickComebackTileKey("p1", new Set(), tiles, canHost)).toBeUndefined();
  });

  it("prefers settled land over the frontier, falling back to the frontier when nothing settled can host", () => {
    const frontier = { ...landTile(1, 1, "p1"), ownershipState: "FRONTIER" } as DomainTileState;
    const tiles = new Map<string, DomainTileState>([["1,1", frontier], ["2,2", landTile(2, 2, "p1")]]);
    const keys = new Set(["1,1", "2,2"]);
    let i = 0;
    const alternate = () => (i++ % 2 === 0 ? 0 : 0.99);
    expect(pickComebackTileKey("p1", keys, tiles, () => true, alternate)).toBe("2,2");
    const onlyFrontierHosts = (tile: DomainTileState | undefined) => tile?.ownershipState === "FRONTIER";
    expect(pickComebackTileKey("p1", keys, tiles, onlyFrontierHosts, alternate)).toBe("1,1");
  });
});

describe("comeback shard rain (RuntimeShardRain tick)", () => {
  // The world map holds only the player's own land at 0..9. Pinning
  // Math.random near 1 aims every ordinary placement roll at the far corner
  // of the world (no tile there), so a site on the territory can only be a
  // comeback site.
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setup = (extraPlayers: RuntimePlayer[] = []) => {
    const tiles = new Map<string, DomainTileState>();
    const territory = new Set<string>();
    for (let x = 0; x < 10; x += 1) {
      for (let y = 0; y < 10; y += 1) {
        tiles.set(`${x},${y}`, landTile(x, y, "player-1"));
        territory.add(`${x},${y}`);
      }
    }
    const players = new Map<string, RuntimePlayer>([["player-1", { id: "player-1", isAi: false } as RuntimePlayer]]);
    for (const player of extraPlayers) players.set(player.id, player);
    const territoryByPlayer = new Map<string, Set<string>>([["player-1", territory]]);
    const rain = new RuntimeShardRain({
      state: { players, tiles },
      now: () => RAIN_AT,
      replaceTileState: (tileKey, tile) => { tiles.set(tileKey, tile); },
      emitEvent: () => undefined,
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
      territoryTileKeysForPlayer: (playerId) => territoryByPlayer.get(playerId) ?? new Set()
    });
    const sitesOnTerritory = () => [...territory].filter((key) => tiles.get(key)?.shardSite?.kind === "FALL");
    return { rain, territory, territoryByPlayer, sitesOnTerritory };
  };

  it("drops a site on the land of a player who just lost most of their territory", () => {
    const { rain, territory, sitesOnTerritory } = setup();
    rain.tick(BEFORE_RAIN);
    for (const key of [...territory].slice(10)) territory.delete(key);

    rain.tick(RAIN_AT);

    expect(sitesOnTerritory()).toHaveLength(1);
  });

  it("leaves a player who kept their land to the ordinary random rain", () => {
    const { rain, sitesOnTerritory } = setup();
    rain.tick(BEFORE_RAIN);

    rain.tick(RAIN_AT);

    expect(sitesOnTerritory()).toHaveLength(0);
  });

  it("does not reward land the player abandoned themselves", () => {
    const { rain, territory, sitesOnTerritory } = setup();
    rain.tick(BEFORE_RAIN);
    rain.runVoluntaryLoss("player-1", () => {
      for (const key of [...territory].slice(10)) territory.delete(key);
    });

    rain.tick(RAIN_AT);

    expect(sitesOnTerritory()).toHaveLength(0);
  });

  it("does not spend the comeback budget on eliminated players or AI empires", () => {
    // Five wiped-out humans (loss 1.0) would fill this rain's whole comeback
    // budget of 4 ahead of the surviving player if they were left in the draw.
    const eliminated = ["player-2", "player-3", "player-4", "player-5", "player-6"].map((id) => ({ id, isAi: false }) as RuntimePlayer);
    const ai = { id: "ai-1", isAi: true } as RuntimePlayer;
    const { rain, territory, territoryByPlayer, sitesOnTerritory } = setup([...eliminated, ai]);
    for (const player of [...eliminated, ai]) territoryByPlayer.set(player.id, new Set(Array.from({ length: 30 }, (_, i) => `${player.id}:${i}`)));
    rain.tick(BEFORE_RAIN);
    for (const player of [...eliminated, ai]) territoryByPlayer.get(player.id)?.clear();
    for (const key of [...territory].slice(10)) territory.delete(key);

    rain.tick(RAIN_AT);

    expect(sitesOnTerritory()).toHaveLength(1);
  });
});
