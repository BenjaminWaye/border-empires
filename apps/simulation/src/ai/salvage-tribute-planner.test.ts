import { describe, expect, it } from "vitest";
import type { AutomationPlannerInput, AutomationPlannerTile } from "./automation-command-planner-types.js";
import { AI, at, placeStructure, plannerRefineryMap } from "./build/refinery-planner-test-map.js";
import { actionAdmissionKey } from "./ai-rejection-cooldown.js";
import { planAutomationCommand } from "./automation-command-planner.js";
import { aiShouldShipSalvage, planSalvageTribute } from "./salvage-tribute-planner.js";
import type { StructurePlannerTile } from "./structure-command-planner.js";

const CAP = 1_000;

const worksMap = (structure: Partial<NonNullable<StructurePlannerTile["economicStructure"]>> = {}): Map<string, StructurePlannerTile> => {
  const tiles = plannerRefineryMap(["...", "...", "..."]);
  const key = `${at(1, 1).x},${at(1, 1).y}`;
  tiles.set(key, { ...tiles.get(key)!, resource: "PRECURSOR_SALVAGE" });
  placeStructure(tiles, 1, 1, { type: "RECLAMATION_WORKS", ...structure });
  return tiles;
};

const input = (tiles: Map<string, StructurePlannerTile>, extra: Partial<AutomationPlannerInput<AutomationPlannerTile>> = {}) => ({
  playerId: AI, sessionPrefix: "ai-runtime", hasActiveLock: false, clientSeq: 7, issuedAt: 1_000,
  tilesByKey: tiles, ownedTiles: [...tiles.values()].filter((tile) => tile.ownerId === AI), frontierTiles: [],
  activeDevelopmentProcessCount: 0, manpower: 100, manpowerCapacity: CAP, ownedStructureCounts: { RECLAMATION_WORKS: 1 },
  ...extra
}) as unknown as AutomationPlannerInput<AutomationPlannerTile>;

describe("aiShouldShipSalvage", () => {
  it("ships only when low enough that the whole delivery lands", () => {
    expect(aiShouldShipSalvage(100, CAP)).toBe(true);
    expect(aiShouldShipSalvage(349, CAP)).toBe(true);
    expect(aiShouldShipSalvage(350, CAP)).toBe(false);
    expect(aiShouldShipSalvage(900, CAP)).toBe(false);
    expect(aiShouldShipSalvage(0, undefined)).toBe(false);
    expect(aiShouldShipSalvage(0, 0)).toBe(false);
  });
});

describe("planSalvageTribute", () => {
  it("ships a load from an active Works when manpower is low", () => {
    const result = planSalvageTribute(input(worksMap()));
    expect(result?.command?.type).toBe("SHIP_SALVAGE_TO_COURT");
    expect(JSON.parse(result!.command!.payloadJson)).toEqual(at(1, 1));
  });

  it("is reached through the full planner ahead of the utility policy", () => {
    // Regression: the AI never issued SHIP_SALVAGE_TO_COURT, so its Works only ever gave the arms bonus.
    expect(planAutomationCommand(input(worksMap())).command?.type).toBe("SHIP_SALVAGE_TO_COURT");
  });

  it("holds its loads when manpower is healthy, the Works is not active, or none is owned", () => {
    expect(planSalvageTribute(input(worksMap(), { manpower: 600 }))).toBeUndefined();
    expect(planSalvageTribute(input(worksMap({ status: "under_construction" })))).toBeUndefined();
    expect(planSalvageTribute(input(worksMap(), { ownedStructureCounts: {} }))).toBeUndefined();
    expect(planSalvageTribute(input(worksMap(), { sessionPrefix: "system-runtime" }))).toBeUndefined();
  });

  it("skips a shipment the server just rejected", () => {
    const tiles = worksMap();
    const first = planSalvageTribute(input(tiles))!.command!;
    expect(planSalvageTribute(input(tiles, { blockedActionKeys: new Set([actionAdmissionKey(first)]) }))).toBeUndefined();
  });
});
