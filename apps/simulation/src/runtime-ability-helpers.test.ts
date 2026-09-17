import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { buildRevealEmpireStatsFromSummary, isCoastalLand } from "./runtime-ability-helpers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

const land = (x: number, y: number): DomainTileState => ({ x, y, terrain: "LAND" } as DomainTileState);
const sea = (x: number, y: number): DomainTileState => ({ x, y, terrain: "SEA" } as DomainTileState);

const tilesMap = (tiles: DomainTileState[]): Map<string, DomainTileState> => {
  const map = new Map<string, DomainTileState>();
  for (const tile of tiles) map.set(simulationTileKey(tile.x, tile.y), tile);
  return map;
};

describe("isCoastalLand", () => {
  it("treats a land tile with only a diagonal sea neighbor as coastal", () => {
    // Worldgen flips every sea tile orthogonally adjacent to land into LAND,
    // so real coastal tiles only ever border open sea diagonally.
    const tiles = tilesMap([land(5, 5), land(5, 6), land(6, 5), sea(6, 6)]);
    expect(isCoastalLand(tiles, 5, 5)).toBe(true);
  });

  it("does not treat a land tile fully surrounded by land as coastal", () => {
    const tiles = tilesMap([land(5, 5), land(5, 4), land(5, 6), land(4, 5), land(6, 5), land(4, 4), land(6, 6), land(4, 6), land(6, 4)]);
    expect(isCoastalLand(tiles, 5, 5)).toBe(false);
  });

  it("returns false for a tile that is not land", () => {
    const tiles = tilesMap([sea(5, 5), sea(5, 6)]);
    expect(isCoastalLand(tiles, 5, 5)).toBe(false);
  });
});

describe("buildRevealEmpireStatsFromSummary", () => {
  const buildTarget = (overrides: Partial<DomainPlayer> = {}): DomainPlayer =>
    ({
      id: "player-2",
      isAi: false,
      points: 0,
      manpower: 21_378,
      manpowerCapSnapshot: 54_000,
      techIds: new Set(),
      strategicResources: { FOOD: 12, TITANIUM: 0, CRYSTAL: 3, UMBRITE: 0, SHARD: 0 },
      ...overrides
    }) as DomainPlayer;

  it("reports the target's real manpower cap instead of echoing current manpower", () => {
    const stats = buildRevealEmpireStatsFromSummary(buildTarget(), 10, 5, 1, 0);
    expect(stats.manpower).toBe(21_378);
    expect(stats.manpowerCap).toBe(54_000);
  });

  it("falls back to the base manpower cap when no cap snapshot has been taken yet", () => {
    const stats = buildRevealEmpireStatsFromSummary(buildTarget({ manpowerCapSnapshot: undefined }), 10, 5, 1, 0);
    expect(stats.manpowerCap).toBe(150);
  });
});
