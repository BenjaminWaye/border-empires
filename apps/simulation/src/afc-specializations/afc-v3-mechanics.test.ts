import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SEASON_VICTORY_ECONOMY_LEAD_MULT } from "@border-empires/game-domain";
import { INCUBATION_ENGINE_INSTANT_POPULATION_BURST, RELAY_BEACON_FREE_FOOD_SLOT_COUNT, SETTLE_MANPOWER_COST, afcExpandPricingFrontierCount, expandManpowerCostForFrontierCount } from "@border-empires/shared";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcPlanetaryDefenseBounty } from "../afc-capture-plunder/afc-capture-plunder.js";
import { settleManpowerCostFor } from "../runtime-settlement-rules.js";
import { relayBeaconFreeFoodSlotCountForPlayer } from "../tech-domain-bridge/slot-waivers.js";
import { afcInstantBuild } from "../structure-manpower-cost/structure-manpower-cost.js";
import { buildEconomicHegemonyObjective } from "../season-victory-objectives/season-victory-objectives.js";
import { breakthroughTileCount } from "./afc-battle-effects.js";
import { grantColonialIncubationEngines, type ColonialCharterDeps } from "./afc-colonial-charter.js";

const player = (id: string, domains: string[] = []) => ({ ...createHumanRuntimePlayer(id), afcUpgradeRuleset: "afc-v1" as const, domainIds: new Set(domains) });

describe("AFC v3 rules", () => {
  it("Pacification Routines pays its bounty only for attacks that take Planetary Defense tiles", () => {
    expect(afcPlanetaryDefenseBounty({ attackerWon: true, actionType: "ATTACK", previousOwnerId: "barbarian-1", bountyPerTile: 25 })).toBe(25);
    expect(afcPlanetaryDefenseBounty({ attackerWon: false, actionType: "ATTACK", previousOwnerId: "barbarian-1", bountyPerTile: 25 })).toBe(0);
    expect(afcPlanetaryDefenseBounty({ attackerWon: true, actionType: "ATTACK", previousOwnerId: "enemy", bountyPerTile: 25 })).toBe(0);
    expect(afcPlanetaryDefenseBounty({ attackerWon: true, actionType: "EXPAND", previousOwnerId: undefined, bountyPerTile: 25 })).toBe(0);
  });

  it("Breakthrough Protocol forces a second surrender only from a flag at full Momentum", () => {
    const attacker = player("p", ["afc-vanguard-3", "afc-vanguard-5"]);
    const flag = (stacks: number) => ({ ownerId: "p", amount: 100, mode: "HOLD" as const, momentum: { stacks, decayAt: 10_000 } });
    expect(breakthroughTileCount(attacker, flag(4), 1000)).toBe(1);
    expect(breakthroughTileCount(attacker, flag(5), 1000)).toBe(2);
    expect(breakthroughTileCount(player("q", ["afc-vanguard-3"]), flag(5), 1000)).toBe(0);
  });

  it("Expansion Doctrine prices EXPAND on half the frontier and halves the garrison manpower", () => {
    expect(expandManpowerCostForFrontierCount(afcExpandPricingFrontierCount(200, 0.5))).toBe(expandManpowerCostForFrontierCount(100));
    expect(afcExpandPricingFrontierCount(201, 1)).toBe(201);
    expect(settleManpowerCostFor(player("p", ["afc-dominion-4"]))).toBe(Math.ceil(SETTLE_MANPOWER_COST / 2));
    expect(settleManpowerCostFor(player("q"))).toBe(SETTLE_MANPOWER_COST);
    expect(settleManpowerCostFor({ points: 0, manpower: 0 })).toBe(SETTLE_MANPOWER_COST);
  });

  it("Relay Fabrication Line doubles the FOOD-free Relays and builds them instantly; Universal Fabrication Line skips monuments", () => {
    expect(relayBeaconFreeFoodSlotCountForPlayer(player("p", ["afc-dominion-1"]))).toBe(RELAY_BEACON_FREE_FOOD_SLOT_COUNT + 5);
    expect(relayBeaconFreeFoodSlotCountForPlayer(player("q"))).toBe(RELAY_BEACON_FREE_FOOD_SLOT_COUNT);
    expect(afcInstantBuild(player("p", ["afc-dominion-1"]), "RELAY_BEACON")).toBe(true);
    expect(afcInstantBuild(player("p", ["afc-dominion-1"]), "FORT")).toBe(false);
    expect(afcInstantBuild(player("u", ["afc-dominion-5"]), "OBSERVATORY")).toBe(true);
    expect(afcInstantBuild(player("u", ["afc-dominion-5"]), "AEGIS_DOME")).toBe(false);
    // Great Projects are raced as part stages; a part must never skip its build time.
    expect(afcInstantBuild(player("u", ["afc-dominion-5"]), "AEGIS_DOME_PART_1")).toBe(false);
    expect(afcInstantBuild(player("u", ["afc-dominion-5"]), "TITANIUM_LEVY_PART_3")).toBe(false);
  });

  it("Metropolitan Concession lowers the Economic Hegemony lead its holder needs", () => {
    const board = [{ id: "lead", name: "Lead", tiles: 1, incomePerMinute: 1.25, techs: 0, manpowerCap: 0, score: 0, rank: 1 },
      { id: "second", name: "Second", tiles: 1, incomePerMinute: 1, techs: 0, manpowerCap: 0, score: 0, rank: 2 }];
    const big = board.map(entry => ({ ...entry, incomePerMinute: entry.incomePerMinute * 1000 }));
    expect(SEASON_VICTORY_ECONOMY_LEAD_MULT).toBeGreaterThan(1.25);
    expect(buildEconomicHegemonyObjective(big).conditionMet).toBe(false);
    const metropolitan = buildEconomicHegemonyObjective(big, id => id === "lead" ? ["afc-exchequer-5"] : []);
    expect(metropolitan.conditionMet).toBe(true);
    expect(metropolitan.thresholdLabel).toContain("20% lead");
  });

  it("Colonial Charter delivers one active Incubation Engine per town, once, with its population burst", () => {
    const actor = player("p", ["afc-dominion-2"]);
    const tiles = new Map<string, DomainTileState>();
    const set = (tile: DomainTileState) => tiles.set(`${tile.x},${tile.y}`, tile);
    set({ x: 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", population: 1000, maxPopulation: 5000 } });
    set({ x: 11, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" });
    const writes: string[] = [];
    const deps: ColonialCharterDeps = { tiles, players: new Map([["p", actor]]), ownedTownKeys: () => ["10,10"],
      replaceTileState: (key, tile) => { writes.push(key); tiles.set(key, tile); }, tileDeltaFromState: tile => ({ x: tile.x, y: tile.y }),
      emitEvent: () => {}, emitPlayerStateUpdate: () => {} };
    expect(grantColonialIncubationEngines(deps, actor, 5)).toBe(1);
    expect(tiles.get("11,10")?.economicStructure).toMatchObject({ ownerId: "p", type: "INCUBATION_ENGINE", status: "active" });
    expect(tiles.get("10,10")?.town).toMatchObject({ colonialIncubationGrantedTo: "p", population: 1000 + INCUBATION_ENGINE_INSTANT_POPULATION_BURST });
    expect(grantColonialIncubationEngines(deps, actor, 6)).toBe(0);
    expect(grantColonialIncubationEngines(deps, player("q"), 7)).toBe(0);
    expect(writes).toHaveLength(2);
  });

  it("Colonial Charter skips settlements and towns that already have an engine, and re-grants a captured town to its new owner", () => {
    const actor = player("p", ["afc-dominion-2"]);
    const tiles = new Map<string, DomainTileState>();
    const set = (tile: DomainTileState) => tiles.set(`${tile.x},${tile.y}`, tile);
    const town = (x: number, populationTier: "SETTLEMENT" | "TOWN", grantedTo?: string): DomainTileState => ({ x, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED",
      town: { type: "MARKET", populationTier, population: 1000, maxPopulation: 5000, ...(grantedTo ? { colonialIncubationGrantedTo: grantedTo } : {}) } });
    set(town(10, "SETTLEMENT")); set({ x: 11, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" });
    set(town(30, "TOWN")); set({ x: 31, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "INCUBATION_ENGINE", status: "active" } });
    set(town(50, "TOWN", "former-owner")); set({ x: 51, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" });
    const deps: ColonialCharterDeps = { tiles, players: new Map([["p", actor]]), ownedTownKeys: () => ["10,10", "30,10", "50,10"],
      replaceTileState: (key, tile) => { tiles.set(key, tile); }, tileDeltaFromState: tile => ({ x: tile.x, y: tile.y }), emitEvent: () => {}, emitPlayerStateUpdate: () => {} };
    expect(grantColonialIncubationEngines(deps, actor, 5)).toBe(1);
    expect(tiles.get("11,10")?.economicStructure).toBeUndefined();
    expect(tiles.get("50,10")?.town?.colonialIncubationGrantedTo).toBe("p");
    expect(tiles.get("51,10")?.economicStructure?.type).toBe("INCUBATION_ENGINE");
  });

  it("Citadel Reserves keeps a town growing next to an active fight", () => {
    let now = 1_700_000_000_000;
    const lock = { commandId: "war", playerId: "p2", actionType: "ATTACK" as const, manpowerCost: 0, originX: 15, originY: 15, targetX: 16, targetY: 16,
      originKey: "15,15", targetKey: "16,16", resolvesAt: now + 30_000, source: "player" as const };
    const grown = (domains: string[]) => {
      const owner = { ...player("p1", domains), points: 500, manpower: 100, strategicResources: { FOOD: 999_999, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } };
      const runtime = new SimulationRuntime({ now: () => now, initialPlayers: new Map([["p1", owner]]), initialState: { activeLocks: [lock], tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN", population: 50_000, maxPopulation: 5_000_000, isFed: true } },
        { x: 11, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", resource: "FISH" }, { x: 12, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", resource: "FISH" }] } });
      runtime.tickPopulationGrowth(now);
      now += 60 * 60_000;
      runtime.tickPopulationGrowth(now);
      return JSON.parse(runtime.exportState().tiles.find(t => t.x === 10 && t.y === 10)!.townJson!).population as number;
    };
    expect(grown([])).toBe(50_000);
    expect(grown(["afc-bastion-1"])).toBeGreaterThan(50_000);
  });
});
