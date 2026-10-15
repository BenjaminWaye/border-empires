import { describe, expect, it } from "vitest";
import { activeActionAdmissionsForPlayer, activeCooldownsForPlayer, actionAdmissionKey, createActionAdmissionState, createRejectionCooldownState, recordActionAdmission, recordRejectionCooldown, REJECTION_COOLDOWN_MS } from "./ai-rejection-cooldown.js";
import { foodCoverageLow } from "./ai-economic-heuristics.js";
import { chooseAutomationPreplanCommand } from "./ai-preplan-command.js";
import { mergePlannerTileDelta, toPlannerTileDelta } from "./planner-tile-delta-merge.js";
import { AI_TECH_PRIORITIES, currentAiTechPriority } from "../tech-domain-bridge/ai-tech-priorities.js";
import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";

const build = (structureType: string) => ({ type: "BUILD_ECONOMIC_STRUCTURE" as const, payloadJson: JSON.stringify({ x: 2, y: 3, structureType }) });
describe("AI progression admission", () => {
  it("isolates a rejected consumer from FOOD producers and exempt beacons", () => {
    const state = createActionAdmissionState();
    const cooldowns = createRejectionCooldownState();
    recordActionAdmission(state, "ai-1", build("INCUBATION_ENGINE"), 1, "INSUFFICIENT_SLOT", 1000);
    recordRejectionCooldown(cooldowns, "ai-1", build("INCUBATION_ENGINE"), 1000, "INSUFFICIENT_SLOT");
    const blocked = activeActionAdmissionsForPlayer(state, "ai-1", 1, 1001)!;
    expect(blocked.has(actionAdmissionKey(build("INCUBATION_ENGINE")))).toBe(true);
    expect(blocked.has(actionAdmissionKey(build("HYDROGARDEN")))).toBe(false);
    expect(blocked.has(actionAdmissionKey(build("RELAY_BEACON")))).toBe(false);
    expect(activeCooldownsForPlayer(cooldowns, "ai-1", 1001)).toBeUndefined();
  });
  it("retries stale failures after a bounded delay even without an ownership revision", () => {
    const state = createActionAdmissionState();
    recordActionAdmission(state, "ai-1", build("SKY_DOCK"), 1, "INSUFFICIENT_SLOT", 1000);
    expect(activeActionAdmissionsForPlayer(state, "ai-1", 1, 1000 + REJECTION_COOLDOWN_MS)).toBeUndefined();
  });
  it.each(["INSUFFICIENT_MANPOWER", "INSUFFICIENT_GOLD", "INSUFFICIENT_MUSTER", "ATTACK_COOLDOWN", "LOCKED"])("does not permanently ban a soft %s failure", code => {
    const state = createActionAdmissionState();
    recordActionAdmission(state, "ai-1", build("HYDROGARDEN"), 1, code);
    expect(activeActionAdmissionsForPlayer(state, "ai-1", 1)).toBeUndefined();
  });
  it("keys attacks by route so a changed target remains eligible", () => {
    const attack = (toX: number) => ({ type: "ATTACK" as const, payloadJson: JSON.stringify({ fromX: 1, fromY: 2, toX, toY: 2 }) });
    expect(actionAdmissionKey(attack(3))).not.toBe(actionAdmissionKey(attack(4)));
  });
  it("uses FOOD capacity instead of retired stockpile balances", () => {
    expect(foodCoverageLow({ FOOD: 0 }, 10, { supply: 20, demand: 10 })).toBe(false);
    expect(foodCoverageLow({ FOOD: 10000 }, 1, { supply: 3, demand: 4 })).toBe(true);
  });
  it("upgrades a populated town only with a free FOOD slot", () => {
    const input = { playerId: "ai-1", points: 100000, manpower: 1000, townCount: 1,
      strategicResources: { FOOD: 10000 }, hasActiveLock: false, ownedTiles: [{ x: 0, y: 0, terrain: "LAND" as const,
        ownershipState: "SETTLED", town: { populationTier: "TOWN" as const, population: 1000000 } }],
      slotSupplyByResource: { FOOD: 4 }, slotDemandByResource: { FOOD: 4 }, clientSeq: 1, issuedAt: 1000, sessionPrefix: "ai-runtime" as const };
    expect(chooseAutomationPreplanCommand(input).command?.type).not.toBe("UPGRADE_TOWN_TIER");
    expect(chooseAutomationPreplanCommand({ ...input, slotSupplyByResource: { FOOD: 5 } }).command?.type).toBe("UPGRADE_TOWN_TIER");
  });
  it("only prioritizes current catalog IDs and rewards useful unlocks", () => {
    for (const id of Object.keys(AI_TECH_PRIORITIES)) expect(techEntryById.has(id), id).toBe(true);
    const access = { hasTown: false, hasDock: false, hasFoodSite: false, hasCrystalSite: false, hasTitaniumSite: false };
    expect(currentAiTechPriority("agriculture", { ...access, hasFoodSite: true })).toBeGreaterThan(currentAiTechPriority("agriculture", access));
    expect(currentAiTechPriority("toolmaking", access)).toBe(0);
  });
  it("preserves and clears active siphon stamps through backfill and deltas", () => {
    const tile = { x: 1, y: 2, terrain: "LAND" as const, sabotage: { ownerId: "ai-1", endsAt: 9000 } };
    expect(mergePlannerTileDelta(undefined, toPlannerTileDelta(tile))?.sabotage).toEqual(tile.sabotage);
    expect(mergePlannerTileDelta(tile, { x: 1, y: 2, sabotageJson: "" })?.sabotage).toBeUndefined();
  });
});
