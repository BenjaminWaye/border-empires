import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { chooseTownToAbandon, foodSlotReliefFromPlannerInput } from "./food-slot-relief.js";
import { mergePlannerTileDelta, toPlannerTileDelta } from "./planner-tile-delta-merge.js";
import { toPlannerTileView } from "./planner-world-view-slice.js";
import { chooseAutomationPreplanCommand } from "./ai-preplan-command.js";
import { planAutomationCommand } from "./automation-command-planner.js";

const town = (x: number): DomainTileState => ({
  x, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED",
  town: { type: "MARKET", populationTier: "TOWN", population: 400 }
});

describe("planner recovery state", () => {
  it("does not abandon an owned AFC even when its town is the cheapest one", () => {
    const capital = { ...town(0), afc: { ownerId: "ai-1", status: "active" as const } };
    expect(chooseTownToAbandon([capital, town(2)], "ai-1"))
      .toEqual({ x: 2, y: 0, kind: "abandon_town" });
    expect(chooseTownToAbandon([capital, { ...town(2), town: { populationTier: "SETTLEMENT" as const } }], "ai-1"))
      .toBeUndefined();
  });

  it("does not protect an inert AFC that belongs to another player", () => {
    const inertAfc = { ...town(0), afc: { ownerId: "ai-2", status: "inactive" as const } };
    expect(chooseTownToAbandon([inertAfc, town(2)], "ai-1"))
      .toEqual({ x: 0, y: 0, kind: "abandon_town" });
  });

  it("preserves eligibility fields through initial export and worker backfill", () => {
    const source: DomainTileState = {
      ...town(0), afc: { ownerId: "ai-1", status: "active" },
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "inactive", inactiveReason: "manual" }
    };
    const view = toPlannerTileView(source);
    const expected = {
      afc: { ownerId: "ai-1" }, town: { population: 400 },
      economicStructure: { inactiveReason: "manual" }
    };
    expect(view).toMatchObject(expected);
    expect(mergePlannerTileDelta(undefined, toPlannerTileDelta(view))).toMatchObject(expected);
  });

  it("updates and clears AFC and disable state from incremental deltas", () => {
    const initial = toPlannerTileView(town(0));
    const withAfc = mergePlannerTileDelta(initial, {
      x: 0, y: 0, afcJson: JSON.stringify({ ownerId: "ai-1", status: "active" }),
      townJson: JSON.stringify({ populationTier: "TOWN", population: 900 }),
      economicStructureJson: JSON.stringify({ ownerId: "ai-1", type: "MINE", status: "inactive", inactiveReason: "manual" })
    });
    expect(withAfc).toMatchObject({
      afc: { ownerId: "ai-1" }, town: { population: 900 }, economicStructure: { inactiveReason: "manual" }
    });
    const cleared = mergePlannerTileDelta(withAfc, {
      x: 0, y: 0, afcJson: "", economicStructureJson: JSON.stringify({ ownerId: "ai-1", type: "MINE", status: "active" })
    });
    expect(cleared).not.toHaveProperty("afc");
    expect(cleared?.economicStructure).not.toHaveProperty("inactiveReason");
  });

  it("can actually upgrade a mature town after the worker transfer", () => {
    const source = town(0);
    source.town = { ...source.town, populationTier: "TOWN", population: 150_000 };
    const transferred = mergePlannerTileDelta(undefined, toPlannerTileDelta(toPlannerTileView(source)));
    expect(transferred).toBeDefined();
    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1", points: 2500, manpower: 1000, townCount: 1, settledTileCount: 1,
      strategicResources: { FOOD: 600 }, hasActiveLock: false, ownedTiles: transferred ? [transferred] : [],
      clientSeq: 1, issuedAt: 1000, sessionPrefix: "ai-runtime"
    });
    expect(result.command).toMatchObject({ type: "UPGRADE_TOWN_TIER", payloadJson: JSON.stringify({ x: 0, y: 0 }) });
  });

  it("builds a FOOD source with no retired stockpile, rather than waiting", () => {
    const farm: DomainTileState = {
      x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", resource: "FARM"
    };
    const result = planAutomationCommand({
      playerId: "ai-1", points: 500, manpower: 1000, techIds: ["agriculture"],
      hasActiveLock: false, activeDevelopmentProcessCount: 0, frontierTiles: [],
      ownedTiles: [farm], buildCandidateTiles: [farm], tilesByKey: new Map([["0,0", farm]]),
      ownedStructureCounts: { RELAY_BEACON: 5 },
      strategicResources: { FOOD: 0 }, slotSupplyByResource: { FOOD: 1 }, slotDemandByResource: { FOOD: 4 },
      clientSeq: 1, issuedAt: 1000, sessionPrefix: "ai-runtime"
    });
    expect(result.command).toMatchObject({ type: "BUILD_ECONOMIC_STRUCTURE", payloadJson: JSON.stringify({ x: 0, y: 0, structureType: "HYDROGARDEN" }) });
  });

  it("preserves a free beacon and disables a real FOOD consumer instead", () => {
    const beacon: DomainTileState = {
      x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "active" }
    };
    const consumer: DomainTileState = {
      x: 3, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "ai-1", type: "MINE", status: "active" }
    };
    const tiles = [beacon, consumer];
    expect(foodSlotReliefFromPlannerInput(tiles, "ai-1", undefined,
      new Map(tiles.map(t => [`${t.x},${t.y}`, t])), 1, 1).reliefTarget)
      .toEqual({ x: 3, y: 0, kind: "disable" });
  });
});
