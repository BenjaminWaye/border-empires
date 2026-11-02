import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS, FORT_TIER_LADDER, SIEGE_TIER_LADDER, STRUCTURE_BUILD_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile } from "../afc-test-fixture/afc-test-fixture.js";
import { structureManpowerCostForPlayer } from "./structure-manpower-cost.js";
import { fortCancelRefund, siegeBatteryCancelRefund } from "../runtime-structure-cancel-refund.js";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";

const STARTING_MANPOWER = 10_000;

const runtimeWith = (domainIds: string[]): SimulationRuntime => new SimulationRuntime({
  now: () => 1_000,
  initialPlayers: new Map([["player-1", {
    id: "player-1", isAi: false, points: 50_000, manpower: STARTING_MANPOWER,
    techIds: new Set<string>(["masonry"]), domainIds: new Set<string>(domainIds),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local", allies: new Set<string>(), autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS },
    strategicResources: { FOOD: 0, TITANIUM: 200, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
  }]]),
  initialState: {
    tiles: [
      afcModuleFixtureTile("player-1"),
      { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
      { x: 30, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
    ],
    activeLocks: [],
  },
});

const submit = (runtime: SimulationRuntime, commandId: string, type: "BUILD_STRUCTURE", clientSeq: number, payload: object): void =>
  runtime.submitCommand({ commandId, sessionId: "session-1", playerId: "player-1", clientSeq, issuedAt: 1_000, type, payloadJson: JSON.stringify(payload) });

const manpower = (runtime: SimulationRuntime): number => runtime.exportState().players.find((p) => p.id === "player-1")!.manpower;

describe("AFC manpower discounts", () => {
  it("multiplies the per-structure and universal discounts", () => {
    const player = { techIds: new Set<string>(), domainIds: new Set(["afc-dominion-1", "afc-dominion-5"]) };
    expect(structureManpowerCostForPlayer(player, "RELAY_BEACON", 120)).toBe(20);
    expect(structureManpowerCostForPlayer(player, "FORT", 300)).toBe(150);
    expect(structureManpowerCostForPlayer({ techIds: new Set<string>(), domainIds: new Set<string>() }, "FORT", 300)).toBe(300);
  });

  it("Fortification Patterns halves a Fort's charge and keeps the flat build minute", async () => {
    const runtime = runtimeWith(["afc-bastion-1"]);
    const before = manpower(runtime);
    submit(runtime, "fort-1", "BUILD_STRUCTURE", 1, { x: 10, y: 10, structureType: "FORT" });
    await Promise.resolve();
    const fort = JSON.parse(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson ?? "{}");
    expect(fort.completesAt - fort.startedAt).toBe(STRUCTURE_BUILD_MS);
    expect(before - manpower(runtime)).toBe(FORT_TIER_LADDER.FORT.manpower / 2);
  });

  // A refund larger than the discounted charge would let build+cancel mint manpower.
  it("cancel refunds exactly the discounted manpower the build charged", () => {
    const bastion = { ...createHumanRuntimePlayer("player-1"), domainIds: new Set(["afc-bastion-1"]) };
    expect(fortCancelRefund(bastion, "FORT").manpower).toBe(FORT_TIER_LADDER.FORT.manpower / 2);
    const universal = { ...createHumanRuntimePlayer("player-1"), domainIds: new Set(["afc-dominion-5"]) };
    expect(siegeBatteryCancelRefund(universal, "SIEGE_BATTERY").manpower).toBe(SIEGE_TIER_LADDER.SIEGE_BATTERY.manpower / 2);
  });
});
