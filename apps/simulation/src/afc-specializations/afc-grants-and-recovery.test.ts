import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { applyAfcInstallationGrant, previewScarcityDelivery } from "./afc-installation-grants.js";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";
import { afcPlayerStatePayload } from "./afc-player-state.js";
import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";

const player = () => ({ ...createHumanRuntimePlayer("p"), afcUpgradeRuleset: "afc-v1" as const });
const tile = (x: number, resource?: DomainTileState["resource"]): DomainTileState => ({ x, y: 0, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", ...(resource ? { resource } : {}) });

describe("AFC installation deliveries and durable recovery", () => {
  it("counts owned known deposits, ignores remaining slots, and delivers without build tech", () => {
    const actor = player();
    actor.techIds = new Set([...techEntryById.values()].filter(tech => tech.effects?.revealResource).map(tech => tech.id));
    const tiles = new Map([tile(1, "FARM"), tile(2, "FARM"), tile(3, "FARM"), tile(4, "TITANIUM"), tile(5, "TITANIUM"), tile(6, "GEMS")].map(t => [`${t.x},0`, t]));
    const preview = previewScarcityDelivery(actor, tiles.values());
    expect(preview.resource).toBe("CRYSTAL");
    expect(preview.deliveries).toEqual([{ key: "6,0", type: "MINE" }]);
    const before = [...actor.techIds];
    const result = applyAfcInstallationGrant({ tiles, now: () => 123, replaceTileState: (key, t) => tiles.set(key, t) }, actor, "afc-exchequer-2", "choose");
    expect(result).toMatchObject({ deliveredBuildings: 1, resource: "CRYSTAL" });
    expect(tiles.get("6,0")?.economicStructure).toMatchObject({ status: "active", type: "MINE", activatedAt: 123 });
    expect([...actor.techIds]).toEqual(before);
  });
  it("skips occupied/locked/unknown deposits and uses a useful no-deposit fallback", () => {
    const actor = player();
    const occupied = { ...tile(1, "FARM"), economicStructure: { ownerId: "p", status: "active" as const, type: "MANUFACTORY" as const } };
    const tiles = new Map([occupied, tile(2, "FARM"), tile(3, "GEMS"), { ...tile(4, "FISH"), terrain: "SEA" as const }, { ...tile(5, "FARM"), observatory: { ownerId: "p", status: "active" as const } }].map(t => [`${t.x},0`, t]));
    expect(previewScarcityDelivery(actor, tiles.values(), key => key === "2,0").fallback).toBe(true);
    const grant = applyAfcInstallationGrant({ tiles, now: () => 1, replaceTileState: () => { throw new Error("must not replace a structure"); }, isLocked: key => key === "2,0" }, actor, "afc-exchequer-2", "pick");
    expect(grant?.fallbackFoodSlots).toBe(1);
    expect(actor.afcScarcityFoodSlots).toBe(1);
  });
  it("limits population to the stable three-town core, skips Metropolises and clamps headroom", () => {
    const actor = { ...player(), afcCoreTownKeys: ["1,0", "2,0", "3,0"] };
    const towns = [1, 2, 3, 4].map(x => ({ ...tile(x), town: { type: "MARKET" as const, populationTier: x === 3 ? "METROPOLIS" as const : "TOWN" as const, population: x === 2 ? 90 : 40, maxPopulation: 100 } }));
    const tiles = new Map(towns.map(t => [`${t.x},0`, t as DomainTileState]));
    const result = applyAfcInstallationGrant({ tiles, now: () => 1, replaceTileState: (key, next) => tiles.set(key, next) }, actor, "afc-exchequer-5", "pick");
    expect(result?.deliveredPopulation).toBe(30);
    expect([1, 2, 3, 4].map(x => tiles.get(`${x},0`)?.town?.population)).toEqual([60, 100, 40, 40]);
  });
  it("recovers paid Coin, overflowing recruits, core order and campaign deadlines together", () => {
    const actor = { ...player(), points: 90, manpower: 900, waystationManpowerOverflow: 700, afcCoreTownKeys: ["3,0", "1,0"], afcScarcityFoodSlots: 1, afcCampaign: { fortWardRecharges: { "2,0": 100_000 }, wars: { enemy: 90_000 } } };
    const recovered = applySimulationEventsToRecoveredState({ tiles: [], activeLocks: [], players: [{ id: "p", points: 100, manpower: 5 }] }, [{ eventType: "DOMAIN_UPDATE", playerId: "p", commandId: "recruit", payloadJson: JSON.stringify({ ...afcPlayerStatePayload(actor), gold: actor.points }) }]);
    expect(recovered.players?.[0]).toMatchObject({ points: 90, manpower: 900, waystationManpowerOverflow: 700, afcCoreTownKeys: ["3,0", "1,0"], afcScarcityFoodSlots: 1, afcCampaign: actor.afcCampaign });
  });
  it("commits the choice and final grant tiles in one recoverable journal event", () => {
    const base = { tiles: [{ ...tile(1), town: { type: "MARKET" as const, populationTier: "TOWN" as const, population: 40, maxPopulation: 100 } }], activeLocks: [], players: [{ id: "p", domainIds: [] }] };
    const event = { eventType: "DOMAIN_UPDATE" as const, playerId: "p", commandId: "pick", payloadJson: JSON.stringify({ afcUpgradeRuleset: "afc-v1", domainIds: ["afc-exchequer-5"], afcInstallationTileDeltas: [{ x: 1, y: 0, ownerId: "p", ownershipState: "SETTLED", townJson: JSON.stringify({ type: "MARKET", populationTier: "TOWN", population: 60, maxPopulation: 100 }) }] }) };
    const recovered = applySimulationEventsToRecoveredState(base, [event]);
    expect(recovered.players?.[0]?.domainIds).toEqual(["afc-exchequer-5"]);
    expect(recovered.tiles[0]?.town?.population).toBe(60);
    expect(applySimulationEventsToRecoveredState(recovered, [event]).tiles[0]?.town?.population).toBe(60);
  });
});
