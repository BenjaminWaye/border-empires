import { describe, expect, it } from "vitest";
import { manufactoryGoldProductionMultiplier, type DomainTileState } from "@border-empires/game-domain";
import { requiredMusterForFort } from "@border-empires/shared";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { requiredMusterForTarget } from "../runtime-combat-resolution.js";
import { titaniumWeaponsFactoryDefenseMultForPlayer, umbriteWeaponsFactoryDefenseMultForPlayer } from "../runtime-weapons-factory-mults.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js";
import { resourceSlotDemandForPlayer } from "../resource-slot-view/resource-slot-view.js";
import { firstThreeTownKeysForPlayer } from "../economy-network/economy-network-first-three-towns.js";
import { townGoldPerMinuteForPlayer } from "../player-update-economy/player-update-economy.js";
import { withAfcReachRadii } from "../runtime/runtime-reach-anchors.js";
import { buildMsWithSpeedForState } from "../../../../packages/client/src/client-build-speed/client-build-speed.js";
import { AFC_SPECIALIZATIONS } from "@border-empires/shared";

const player = (id: string, domains: string[] = []) => ({ ...createHumanRuntimePlayer(id), afcUpgradeRuleset: "afc-v1" as const, domainIds: new Set(domains) });
const town = (x: number, ownerId = "p"): DomainTileState => ({ x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED",
  town: { type: "MARKET", populationTier: "TOWN", supportCurrent: 5, supportMax: 5, isFed: true, population: 10_000, maxPopulation: 25_000 } });

describe("AFC passive effects change authoritative numbers", () => {
  it("stacks beacon fabrication ×3 with universal ×2, including ordinary buildings", () => {
    const state = { techIds: [], domainIds: ["afc-dominion-1", "afc-dominion-5"], techCatalog: [],
      domainCatalog: AFC_SPECIALIZATIONS.map(upgrade => ({ ...upgrade, mods: {}, requirements: { gold: 0, resources: {} } })) };
    expect(buildMsWithSpeedForState(state, "RELAY_BEACON", 60_000)).toBe(10_000);
    expect(buildMsWithSpeedForState(state, "OBSERVATORY", 60_000)).toBe(30_000);
    expect(buildMsWithSpeedForState(state, "FORT", 60_000)).toBe(30_000);
    expect(buildMsWithSpeedForState(state, "RELAY_BEACON", 0)).toBe(0);
  });
  it("doubles only each factory's defense contribution", () => {
    const defender = player("d");
    const context = { players: new Map([["d", defender]]), ownedStructureCountForPlayer: () => 3 };
    const titanium = titaniumWeaponsFactoryDefenseMultForPlayer(context, "d");
    const umbrite = umbriteWeaponsFactoryDefenseMultForPlayer(context, "d");
    defender.domainIds.add("afc-bastion-2");
    expect(titaniumWeaponsFactoryDefenseMultForPlayer(context, "d")).toBeCloseTo(1 + (titanium - 1) * 2);
    expect(umbriteWeaponsFactoryDefenseMultForPlayer(context, "d")).toBeCloseTo(1 + (umbrite - 1) * 2);
  });
  it("Sappers and Defensive Depth cancel on the same fort commitment baseline", () => {
    const attacker = player("a", ["afc-vanguard-4"]);
    const defender = player("d", ["afc-bastion-4"]);
    const target: DomainTileState = { ...town(1, "d"), fort: { ownerId: "d", status: "active", variant: "FORT" } };
    const base = requiredMusterForFort("FORT");
    expect(requiredMusterForTarget(target, attacker, defender)).toBe(base);
    expect(requiredMusterForTarget(target, undefined, defender)).toBe(base * 2);
    expect(requiredMusterForTarget(target, attacker)).toBe(Math.ceil(base / 2));
    expect(requiredMusterForTarget({ ...target, fort: undefined }, attacker, defender)).toBe(requiredMusterForFort());
  });
  it("reduces FOOD for the same three core towns, leaving support buildings charged", () => {
    const actor = { ...player("p", ["afc-exchequer-1"]), afcCoreTownKeys: ["3,0", "1,0", "2,0"] };
    const towns = [town(1), town(2), town(3), town(4)];
    towns.push({ x: 5, y: 0, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", status: "active", type: "MANUFACTORY" } });
    const base = resourceSlotDemandForPlayer(towns, "p").FOOD;
    const boosted = resourceSlotDemandForPlayer(towns, "p", slotWaiversForPlayer(actor)).FOOD;
    expect(base - boosted).toBe(6);
    expect(boosted).toBeGreaterThan(0);
  });
  it("keeps core membership ordered across input/recovery order and deterministically backfills loss", () => {
    const actor = { ...player("p"), afcCoreTownKeys: ["3,0", "1,0", "2,0"] };
    const entries = [["4,0", "TOWN"], ["2,0", "TOWN"], ["1,0", "TOWN"], ["3,0", "TOWN"]] as const;
    expect([...firstThreeTownKeysForPlayer("p", entries, actor)]).toEqual(["3,0", "1,0", "2,0"]);
    expect([...firstThreeTownKeysForPlayer("p", entries.filter(([key]) => key !== "1,0"), actor)]).toEqual(["3,0", "2,0", "4,0"]);
  });
  it("stacks both Exchequer core income upgrades to ×3 actual town output", () => {
    const tile = town(1);
    const tiles = new Map([["1,0", tile]]);
    const core = new Set(["1,0"]);
    const ordinary = townGoldPerMinuteForPlayer(player("p"), tile, tile.town!, tiles, core, core);
    const boosted = townGoldPerMinuteForPlayer(player("p", ["afc-exchequer-1", "afc-exchequer-5"]), tile, tile.town!, tiles, core, core);
    expect(ordinary).toBeGreaterThan(0);
    expect(boosted).toBeCloseTo(ordinary * 3);
  });
  it("doubles the Clearing House's +25pp uplift and retains the +10% base", () => {
    expect(manufactoryGoldProductionMultiplier(1, true, 2)).toBeCloseTo(1.6);
    expect(manufactoryGoldProductionMultiplier(2, true, 2)).toBeCloseTo(2.2);
    expect(manufactoryGoldProductionMultiplier(1, false, 2)).toBeCloseTo(1.1);
  });
  it("extends existing town and dock anchors without changing outpost radius", () => {
    const actor = player("p", ["afc-dominion-2", "afc-dominion-3"]);
    const anchors = withAfcReachRadii((["TOWN", "DOCK", "OUTPOST"] as const).map(kind => ({ kind, x: 1, y: 1, ownerId: "p", activatedAt: 0 })), new Map([["p", actor]]));
    expect(anchors[0]?.radiusOverride).toBe(4);
    expect(anchors[1]?.radiusOverride).toBe(2);
    expect(anchors[2]?.radiusOverride).toBeUndefined();
  });
  it("waives only the earliest qualifying tower's CRYSTAL demand", () => {
    const actor = player("p", ["afc-oracle-1"]);
    const tiles: DomainTileState[] = [1, 2].map(x => ({ x, y: 0, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", observatory: { ownerId: "p", status: "active", activatedAt: x } }));
    expect(resourceSlotDemandForPlayer(tiles, "p", slotWaiversForPlayer(actor)).CRYSTAL).toBe(2);
  });
});
