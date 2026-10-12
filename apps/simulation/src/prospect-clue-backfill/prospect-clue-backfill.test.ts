import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { backfillProspectClues } from "./prospect-clue-backfill.js";

const W = 60;
const H = 60;

const world = (resources: Array<[number, number, DomainTileState["resource"]]>, extra: Partial<DomainTileState> = {}): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) tiles.set(`${x},${y}`, { x, y, terrain: "LAND" });
  for (const [x, y, resource] of resources) tiles.set(`${x},${y}`, { x, y, terrain: "LAND", ...(resource ? { resource } : {}), ...extra });
  return tiles;
};

// Seasons generated before clues survived recovery have none anywhere; their
// frozen baseline can't be regenerated, so clues are re-derived from the
// persisted strategic resource tiles.
describe("backfillProspectClues", () => {
  it("marks land around a strategic cluster with that resource's clue", () => {
    const tiles = world([[30, 30, "TITANIUM"], [31, 30, "TITANIUM"], [30, 31, "TITANIUM"]]);
    expect(backfillProspectClues(tiles, W, H)).toBeGreaterThan(0);
    expect(tiles.get("30,30")?.prospectSignature).toBe("FERROUS_DUST");
    expect(tiles.get("38,30")?.prospectSignature).toBe("FERROUS_DUST");
    expect(tiles.get("45,30")?.prospectSignature).toBeUndefined();
  });

  it("ignores non-strategic resources", () => {
    const tiles = world([[40, 40, "FARM"], [41, 40, "FARM"], [40, 41, "FISH"]]);
    expect(backfillProspectClues(tiles, W, H)).toBe(0);
  });

  it("leaves worlds that already carry clues alone", () => {
    const tiles = world([[30, 30, "TITANIUM"], [31, 30, "TITANIUM"], [30, 31, "TITANIUM"]]);
    tiles.set("5,5", { x: 5, y: 5, terrain: "LAND", prospectSignature: "BLACKWOOD_CANOPY" });
    expect(backfillProspectClues(tiles, W, H)).toBe(0);
    expect(tiles.get("38,30")?.prospectSignature).toBeUndefined();
  });

  it("gives each tile the nearest cluster's clue", () => {
    const tiles = world([[10, 30, "TITANIUM"], [11, 30, "TITANIUM"], [10, 31, "TITANIUM"], [30, 30, "UMBRITE"], [31, 30, "UMBRITE"], [30, 31, "UMBRITE"]]);
    backfillProspectClues(tiles, W, H);
    expect(tiles.get("14,30")?.prospectSignature).toBe("FERROUS_DUST");
    expect(tiles.get("26,30")?.prospectSignature).toBe("BLACKWOOD_CANOPY");
  });
});
