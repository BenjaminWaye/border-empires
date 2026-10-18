import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { restoreRecoveredTownOrder, restoreTownSettledAt, townSettledAtForSnapshot } from "./recovered-town-state.js";

const town = { name: "Town", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 } as const;
const tile = (x: number, overrides: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", town, ...overrides }) as DomainTileState;

describe("townSettledAtForSnapshot", () => {
  it("returns only towns with a finite stamp, in the given town order", () => {
    const stamps = new Map([["2,0", 200], ["1,0", 100], ["9,0", 900], ["3,0", Number.NaN]]);
    expect(townSettledAtForSnapshot(["2,0", "1,0", "3,0", "4,0"], stamps)).toEqual([
      { tileKey: "2,0", settledAt: 200 },
      { tileKey: "1,0", settledAt: 100 }
    ]);
  });

  it("returns nothing without a stamp map", () => {
    expect(townSettledAtForSnapshot(["1,0"], undefined)).toEqual([]);
  });
});

describe("restoreTownSettledAt", () => {
  it("restores stamps only for towns the player still holds settled", () => {
    const tiles = new Map<string, DomainTileState>([
      ["1,0", tile(1)],
      ["2,0", tile(2, { ownerId: "p2" })],
      ["3,0", tile(3, { ownershipState: "FRONTIER" })],
      ["4,0", tile(4, { town: undefined })]
    ]);
    const stamps = new Map<string, number>();
    restoreTownSettledAt(stamps, tiles, "p1", [
      { tileKey: "1,0", settledAt: 10 },
      { tileKey: "2,0", settledAt: 20 },
      { tileKey: "3,0", settledAt: 30 },
      { tileKey: "4,0", settledAt: 40 },
      { tileKey: "5,0", settledAt: 50 }
    ]);
    expect([...stamps]).toEqual([["1,0", 10]]);
  });
});

describe("restoreRecoveredTownOrder", () => {
  it("applies the recovered order, drops lost towns and appends new ones", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    summary.ownedTownTierByTile.set("a", "SETTLEMENT");
    summary.ownedTownTierByTile.set("b", "TOWN");
    summary.ownedTownTierByTile.set("c", "CITY");
    restoreRecoveredTownOrder(summary, ["c", "gone", "a"]);
    expect([...summary.ownedTownTierByTile]).toEqual([
      ["c", "CITY"],
      ["a", "SETTLEMENT"],
      ["b", "TOWN"]
    ]);
  });
});
