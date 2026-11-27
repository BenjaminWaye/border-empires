import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import { returnableTownsFor, townReturnProblem } from "./returnable-towns.js";

const NOW = 100_000;
const capture = (x: number, from: string, occurredAt: number, playerId = "p1"): PersonalImpactEvent => ({
  id: `c:${x}:${occurredAt}`, kind: "TOWN_CAPTURED", playerId, occurredAt, x, y: 0, townTier: "TOWN", townSurvived: true,
  populationBefore: 10, populationAfter: 9, capturedStructureTypes: [], counterpartyPlayerId: from
});
const town = (x: number, ownerId: string, extra: Partial<DomainTileState> = {}): [string, DomainTileState] =>
  [`${x},0`, { x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "CITY" }, ...extra }];

describe("returnable towns", () => {
  const ctx = (entries: PersonalImpactEvent[], tiles: [string, DomainTileState][]) => ({
    tiles: new Map(tiles), now: () => NOW, personalImpactEntries: () => entries, townGoldPerMinute: () => 2
  });

  it("names the empire each town was last taken from, never barbarians", () => {
    const towns = returnableTownsFor(ctx(
      [capture(1, "p2", 10), capture(1, "p3", 20), capture(2, "barbarian-1", 30), capture(3, "p2", 40, "p9")],
      [town(1, "p1"), town(2, "p1"), town(3, "p9")]
    ), "p1");
    expect(towns).toEqual([{ x: 1, y: 0, toPlayerId: "p3", tier: "CITY", goldPerMinute: 2, capturedAt: 20 }]);
  });

  it("drops towns the holder has since lost or that were razed", () => {
    expect(returnableTownsFor(ctx([capture(1, "p2", 10)], [town(1, "p4")]), "p1")).toEqual([]);
    expect(returnableTownsFor(ctx([capture(1, "p2", 10)], [[`1,0`, { x: 1, y: 0, terrain: "LAND", ownerId: "p1" }]]), "p1")).toEqual([]);
  });

  it("refuses a town with the giver's muster flag on it", () => {
    const flagged = town(1, "p1", { muster: { amount: 5 } as DomainTileState["muster"] });
    expect(townReturnProblem(ctx([capture(1, "p2", 10)], [flagged]), { id: "p1", name: "Ada" }, "p2", [{ x: 1, y: 0 }], false))
      .toBe("Ada has a muster flag in the town at (1, 0)");
  });
});
