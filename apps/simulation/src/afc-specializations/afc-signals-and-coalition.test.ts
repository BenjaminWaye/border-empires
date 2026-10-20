import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { buildAfcSignalIndex, afcDetectionsForPlayer, AfcOracleDetectionTracker, type AfcOracleDetectionDeps } from "./afc-oracle-detections.js";
import { afcEnvoyBenefits, coalitionAttackMult, recordAfcHostileCapture } from "./afc-coalition.js";
import { dockConnectedOwnedSettledCount } from "../economy-network/economy-network-dock-income.js";
import { consumeFortWard, fortWardIsReady } from "./afc-battle-effects.js";
import { withAfcFortFacts } from "./afc-fort-facts.js";

const player = (id: string, ids: string[] = []) => ({ ...createHumanRuntimePlayer(id), afcUpgradeRuleset: "afc-v1" as const, domainIds: new Set(ids) });
const tile = (x: number, ownerId: string): DomainTileState => ({ x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED" });

describe("AFC authoritative signals and coalition effects", () => {
  it("returns exact masked flag signals without leaking hidden manpower, orders, or tiles", () => {
    const actor = player("p", ["afc-oracle-5"]), enemy = player("e");
    const players = new Map([["p", actor], ["e", enemy]]);
    const tower = { ...tile(1, "p"), observatory: { ownerId: "p", status: "active" as const } };
    const flag = { ...tile(4, "e"), resource: "GEMS" as const, muster: { ownerId: "e", amount: 999, mode: "MARCH" as const, targetX: 40, targetY: 0 } };
    const tiles = new Map([["1,0", tower], ["4,0", flag]]);
    const deps: AfcOracleDetectionDeps = { players: () => players, tiles: () => tiles, flagsByOwner: () => new Map([["e", new Set(["4,0"])]]), towersByOwner: () => new Map([["p", new Set(["1,0"])]]), now: () => 100, isTowerDormant: () => false, emit: () => {}, scheduleSoon: task => task() };
    const index = buildAfcSignalIndex(tiles, deps.flagsByOwner());
    expect(afcDetectionsForPlayer(actor, deps, index)).toEqual([{ x: 4, y: 0, ownerId: "e" }]);
    expect(afcDetectionsForPlayer(actor, { ...deps, isTowerDormant: () => true }, index)).toEqual([]);
    tiles.set("1,0", { ...tower, observatory: { ...tower.observatory, suppressedUntil: 101 } });
    expect(afcDetectionsForPlayer(actor, deps, index)).toEqual([]);
    tiles.set("1,0", tower); actor.allies.add("e");
    expect(afcDetectionsForPlayer(actor, deps, index)).toEqual([]);
    actor.allies.clear(); actor.domainIds.clear();
    expect(afcDetectionsForPlayer(actor, deps, index)).toEqual([]);
  });
  it("does no flag-index work for an ordinary player's reconnect", () => {
    const actor = player("p"); let reads = 0;
    const tracker = new AfcOracleDetectionTracker({ players: () => new Map([["p", actor]]), tiles: () => { reads++; return new Map(); }, flagsByOwner: () => new Map(), towersByOwner: () => new Map(), now: () => 0, isTowerDormant: () => false, emit: () => {}, scheduleSoon: task => task() });
    tracker.sendTo("p"); tracker.refreshAll();
    expect(reads).toBe(0);
    expect(tracker.cachedFlagsFor("p")).toEqual([]);
  });
  it("requires mutual allies, has no ally-count cap, and shares the agreed percentage benefits", () => {
    const actor = player("p", ["afc-chancery-1"]);
    const allies = Array.from({ length: 12 }, (_, i) => player(`a${i}`));
    const players = new Map([actor, ...allies].map(p => [p.id, p]));
    for (const ally of allies) { actor.allies.add(ally.id); ally.allies.add("p"); }
    expect(afcEnvoyBenefits(actor, players, () => ({ goldPerMinute: 1, manpowerCap: 1000, manpowerRegenPerMinute: 1 })).manpowerCap).toBeCloseTo(1200);
    allies[0]!.allies.clear();
    expect(afcEnvoyBenefits(actor, players, () => ({ goldPerMinute: 1, manpowerCap: 1000, manpowerRegenPerMinute: 1 })).allies).toBe(11);
  });
  it("records captures in either direction, gives one shared-war bonus, and expires at 24h", () => {
    const actor = player("p", ["afc-chancery-3"]), ally = player("a"), enemy = player("e");
    actor.allies.add("a"); ally.allies.add("p");
    const players = new Map([actor, ally, enemy].map(p => [p.id, p]));
    recordAfcHostileCapture(players, "e", "p", 100);
    expect(coalitionAttackMult(actor, "e", players, 101)).toBe(1);
    recordAfcHostileCapture(players, "a", "e", 100);
    expect(coalitionAttackMult(actor, "e", players, 101)).toBe(1.15);
    expect(coalitionAttackMult(actor, "e", players, 100 + 86_400_000)).toBe(1);
    ally.allies.clear();
    expect(coalitionAttackMult(actor, "e", players, 101)).toBe(1);
  });
  it("weights each physical allied dock link once, grants reciprocity, and never quadruples", () => {
    const first = player("p", ["afc-chancery-2"]), second = player("a"); first.allies.add("a"); second.allies.add("p");
    const players = new Map([["p", first], ["a", second]]);
    const tiles = new Map([1, 2, 3].map(x => [`${x},0`, { ...tile(x, x === 2 ? "a" : "p"), dockId: `dock${x}` }]));
    const context = { tiles, players, dockLinksByDockTileKey: new Map([["1,0", ["2,0", "2,0", "3,0"]], ["2,0", ["1,0"]]]) };
    expect(dockConnectedOwnedSettledCount("1,0", "p", context)).toBe(3);
    expect(dockConnectedOwnedSettledCount("2,0", "a", context)).toBe(1);
    second.domainIds.add("afc-chancery-2");
    expect(dockConnectedOwnedSettledCount("1,0", "p", context)).toBe(3);
    expect(dockConnectedOwnedSettledCount("2,0", "a", context)).toBe(2);
    second.allies.clear(); expect(dockConnectedOwnedSettledCount("1,0", "p", context)).toBe(1);
  });
  it("keeps ward recharge through rebuilding and ownership transfer", () => {
    const actor = player("p", ["afc-bastion-5"]), other = player("q", ["afc-bastion-5"]);
    const players = new Map([["p", actor], ["q", other]]); let now = 100;
    const fort: DomainTileState = { ...tile(1, "p"), fort: { ownerId: "p", status: "active" } };
    expect(fortWardIsReady(players, fort, now)).toBe(true);
    const until = consumeFortWard({ players, tiles: new Map([["1,0", fort]]), now: () => now, replaceTileState: () => {} }, fort, "attack");
    const rebuilt = { ...fort, ownerId: "q", fort: { ownerId: "q", status: "active" as const } };
    expect(fortWardIsReady(players, rebuilt, now)).toBe(false);
    expect(withAfcFortFacts(rebuilt, players).fort?.wardRechargesAt).toBe(until);
    now = until; expect(fortWardIsReady(players, rebuilt, now)).toBe(true);
  });
});
