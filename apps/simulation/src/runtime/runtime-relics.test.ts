import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_WIDTH, buildFrontierCombatPreview, createRelicState } from "@border-empires/shared";
import { addRelicResourceSupply, activateRelic, activeRelicTiles, consumeBattleRelics, fieldGeneratorForTarget } from "../runtime-relics.js";
import { RelicMapHintIndex } from "../runtime-relic-map-hints.js";
import { applyTileToPlayerSummary, createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";
import { syncWatchtowerObservatory, refreshPlayerWonders } from "../runtime-natural-wonders.js";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";

const relicTile = (type: NonNullable<DomainTileState["naturalWonder"]>["type"], x = 10): DomainTileState => ({
  x, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", naturalWonder: createRelicState(type)
});
const indexedContext = (tiles: DomainTileState[]) => {
  const map = new Map(tiles.map(tile => [`${tile.x},${tile.y}`, tile]));
  const summaries = new Map<string, ReturnType<typeof createEmptyPlayerRuntimeSummary>>();
  for (const tile of tiles) if (tile.ownerId) {
    let summary = summaries.get(tile.ownerId);
    if (!summary) { summary = createEmptyPlayerRuntimeSummary(); summaries.set(tile.ownerId, summary); }
    applyTileToPlayerSummary(summary, `${tile.x},${tile.y}`, tile);
  }
  const events: SimulationEvent[] = [];
  return {
    tiles: map,
    summaryForPlayer: (id: string) => summaries.get(id) ?? createEmptyPlayerRuntimeSummary(),
    replaceTileState: (key: string, tile: DomainTileState) => { map.set(key, tile); },
    tileDeltaFromState: (tile: DomainTileState) => ({ x: tile.x, y: tile.y, naturalWonderJson: JSON.stringify(tile.naturalWonder) }),
    emitEvent: (event: SimulationEvent) => { events.push(event); }, events
  };
};

describe("redesigned relic runtime", () => {
  it("opens ancillary bodies on garrison only, and a capture never awards them again", () => {
    const p = buildPlayer("p", { manpower: 0 }), q = buildPlayer("q", { manpower: 0 });
    const frontier = { ...relicTile("CONSCRIPTION_ENGINE"), ownershipState: "FRONTIER" as const };
    expect(activateRelic(frontier, p, 100, 0).naturalWonder?.remainingUses).toBe(1);
    expect(p.manpower).toBe(0);
    const opened = activateRelic({ ...frontier, ownershipState: "SETTLED" }, p, 200, 0);
    expect(p.manpower).toBe(2000); expect(opened.naturalWonder?.remainingUses).toBe(0);
    const captured = activateRelic({ ...opened, ownerId: "q" }, q, 300, 0);
    expect(q.manpower).toBe(0); expect(captured.naturalWonder?.remainingUses).toBe(0);
  });
  it("books the final suit and field charge once, persists zero, and removes future bonuses", () => {
    const suit = relicTile("WARPRESS"), field = { ...relicTile("BASTION_FRAME", 12), ownerId: "q" };
    suit.naturalWonder = { ...suit.naturalWonder!, remainingUses: 1 };
    field.naturalWonder = { ...field.naturalWonder!, remainingUses: 1 };
    const target: DomainTileState = { x: 13, y: 10, terrain: "LAND", ownerId: "q", ownershipState: "SETTLED" };
    const ctx = indexedContext([suit, field, target]);
    const frozen = buildFrontierCombatPreview(target, { relicAttackMult: 1.5, relicDefenseMult: 1.5 });
    consumeBattleRelics(ctx, "p", target, "battle");
    expect(activeRelicTiles(ctx, "p", "WARPRESS")).toHaveLength(0);
    expect(fieldGeneratorForTarget(ctx, "q", target)).toBeUndefined();
    expect(frozen.attacker.battle).toContainEqual({ label: "Combat suits", mult: 1.5 });
    expect(frozen.defender.battle).toContainEqual({ label: "Ancient force field", mult: 1.5 });
    const recovered = applySimulationEventsToRecoveredState({ tiles: [suit, field, target], players: [], activeLocks: [], pendingSettlements: [], playerYieldCollectionEpochByPlayer: [] }, ctx.events);
    expect(recovered.tiles.find(t => t.x === 10)?.naturalWonder?.remainingUses).toBe(0);
    expect(recovered.tiles.find(t => t.x === 12)?.naturalWonder?.remainingUses).toBe(0);
    consumeBattleRelics(ctx, "p", target, "battle2");
    expect(ctx.events).toHaveLength(2);
  });
  it("limits fields to nearby owned garrisoned land, including wraparound", () => {
    const ctx = indexedContext([relicTile("BASTION_FRAME", 0)]);
    const target = { ...relicTile("QUICKFORGE", 1), naturalWonder: undefined };
    expect(fieldGeneratorForTarget(ctx, "p", target)).toBeDefined();
    expect(fieldGeneratorForTarget(ctx, "p", { ...target, x: 4 })).toBeUndefined();
    expect(fieldGeneratorForTarget(ctx, "p", { ...target, x: WORLD_WIDTH - 1 })).toBeDefined();
    expect(fieldGeneratorForTarget(ctx, "p", { ...target, ownershipState: "FRONTIER" })).toBeUndefined();
    expect(fieldGeneratorForTarget(ctx, "p", { ...target, terrain: "SEA" })).toBeUndefined();
  });
  it("replaces old suit, vault and research bonuses while retaining dock improvements", () => {
    const player = buildPlayer("p");
    const cache = new Map<string, Set<string>>();
    refreshPlayerWonders("p", [relicTile("WARPRESS"), relicTile("CONSCRIPTION_ENGINE"), relicTile("CALCULATING_ENGINE"), relicTile("DEEPWATER_ENGINE")], cache, new Map([["p", player]]));
    expect(player.wonderMusterRateMultiplier).toBe(1); expect(player.wonderMusterExtraFlag).toBe(0);
    expect(player.wonderTechGoldDiscount).toBe(0); expect(player.relicDevelopmentBonus).toBe(1);
    expect(cache.get("p")?.has("CONSCRIPTION_ENGINE")).toBe(false); expect(player.wonderDockGoldMultiplier).toBe(2);
  });
  it("reveals anonymous nearby signals, never ownership or hidden resource types", () => {
    const array = relicTile("CARTOGRAPHERS_LENS"), unknown = { ...relicTile("WARPRESS", 20), ownerId: "enemy" };
    const ctx = indexedContext([array, unknown, { x: 11, y: 10, terrain: "LAND", resource: "UMBRITE", ownerId: "enemy" }]);
    const hints = new RelicMapHintIndex(); hints.refresh("10,10", array); hints.refresh("20,10", unknown);
    const result = hints.hintsFor(ctx, buildPlayer("p"));
    expect(result).toContainEqual({ x: 20, y: 10, kind: "RELIC" });
    expect(result.some(hint => hint.kind === "RESOURCE")).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/enemy|WARPRESS|remainingUses/);
    expect(hints.hintsFor(ctx, buildPlayer("p", { techIds: new Set(["leatherworking"]) }))).toContainEqual({ x: 11, y: 10, kind: "RESOURCE", resource: "UMBRITE" });
  });
  it("garrison activation writes the awarded reserve into the runtime snapshot", async () => {
    const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, initialPlayers: new Map([["p", buildPlayer("p", { points: 1000, manpower: 1000 })]]), initialState: {
      tiles: [{ ...relicTile("CONSCRIPTION_ENGINE"), ownershipState: "FRONTIER" }, { x: 10, y: 9, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } }], activeLocks: []
    } });
    const events = collectEvents(runtime);
    const before = runtime.exportSnapshotSections().initialState;
    const beforeManpower = runtime.exportState().players.find(p => p.id === "p")!.manpower;
    const command = { sessionId: "s", playerId: "p", issuedAt: 1000, payloadJson: JSON.stringify({ x: 10, y: 10 }) };
    runtime.submitCommand({ ...command, commandId: "settle", clientSeq: 1, type: "SETTLE" }); await Promise.resolve();
    runtime.submitCommand({ ...command, commandId: "rush", clientSeq: 2, type: "RUSH_BUY" }); await Promise.resolve();
    expect(events.filter(e => e.eventType === "COMMAND_REJECTED")).toEqual([]);
    const tile = runtime.exportState().tiles.find(t => t.x === 10 && t.y === 10);
    expect(JSON.parse(tile!.naturalWonderJson!).remainingUses).toBe(0);
    expect(runtime.exportState().players.find(p => p.id === "p")!.manpower).toBeGreaterThanOrEqual(beforeManpower + 1900);
    const snapshot = runtime.exportSnapshotSections();
    expect(JSON.stringify(snapshot)).toContain('"remainingUses":0');
    const recovered = applySimulationEventsToRecoveredState(before, events.filter(event => event.eventType !== "PLAYER_MESSAGE"));
    const awarded = snapshot.initialState.players?.find(player => player.id === "p");
    expect(recovered.players?.find(player => player.id === "p")).toMatchObject({
      manpower: awarded?.manpower, waystationManpowerOverflow: awarded?.waystationManpowerOverflow
    });
    expect(recovered.tiles.find(tile => tile.x === 10 && tile.y === 10)?.naturalWonder?.remainingUses).toBe(0);
    const restarted = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, seedTiles: new Map(), initialState: recovered });
    expect(restarted.exportSnapshotSections().initialState.players?.find(player => player.id === "p")?.manpower).toBe(awarded?.manpower);
  });
});

it("spends five nano subsidies on successful rushes, then charges normally", async () => {
  const nano = relicTile("QUICKFORGE", 99);
  const sites: DomainTileState[] = [nano];
  for (let i = 0; i < 6; i += 1) {
    sites.push({ x: 10 + i * 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "FRONTIER" });
    sites.push({ x: 10 + i * 10, y: 9, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: { name: `Home ${i}`, type: "FARMING", populationTier: "SETTLEMENT" } });
  }
  const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, initialPlayers: new Map([["p", buildPlayer("p", { points: 10000, manpower: 10000 })]]), initialState: { tiles: sites, activeLocks: [] } });
  let seq = 0;
  const submit = async (type: "SETTLE" | "RUSH_BUY", x: number) => {
    seq += 1; runtime.submitCommand({ type, commandId: `nano-${seq}`, sessionId: "s", playerId: "p", clientSeq: seq, issuedAt: 1000, payloadJson: JSON.stringify({ x, y: 10 }) }); await Promise.resolve();
  };
  const remaining = () => JSON.parse(runtime.exportState().tiles.find(t => t.x === 99)!.naturalWonderJson!).remainingUses;
  await submit("RUSH_BUY", 500); expect(remaining()).toBe(5);
  for (let i = 0; i < 6; i += 1) {
    const x = 10 + i * 10; await submit("SETTLE", x);
    const before = runtime.exportState().players.find(p => p.id === "p")!.points;
    await submit("RUSH_BUY", x);
    const after = runtime.exportState().players.find(p => p.id === "p")!.points;
    expect(before - after).toBe(i < 5 ? 0 : 10);
  }
  expect(remaining()).toBe(0);
});

it("freezes the final suit and field bonuses in an accepted runtime battle", async () => {
  const suit = relicTile("WARPRESS"), field = { ...relicTile("BASTION_FRAME", 12), ownerId: "q" };
  suit.naturalWonder = { ...suit.naturalWonder!, remainingUses: 1 }; field.naturalWonder = { ...field.naturalWonder!, remainingUses: 1 };
  const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, initialPlayers: new Map([["p", buildPlayer("p", { manpower: 1000 })], ["q", buildPlayer("q", { manpower: 1000 })]]), initialState: { tiles: [
    suit, field,
    { x: 10, y: 11, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", muster: { ownerId: "p", amount: 300, mode: "HOLD", updatedAt: 0 } },
    { x: 11, y: 11, terrain: "LAND", ownerId: "q", ownershipState: "SETTLED" }
  ], activeLocks: [] } });
  const target = { x: 11, y: 11 };
  expect(runtime.getPlayerCombatSummary("p", target)?.relicCombatFacts?.attackMultiplier).toBe(1.5);
  expect(runtime.getPlayerCombatSummary("q", target)?.relicCombatFacts?.defenseMultiplier).toBe(1.5);
  const events = collectEvents(runtime);
  runtime.submitCommand({ type: "ATTACK", commandId: "relic-battle", sessionId: "s", playerId: "p", clientSeq: 1, issuedAt: 1000, payloadJson: JSON.stringify({ fromX: 10, fromY: 11, toX: 11, toY: 11 }) }); await Promise.resolve();
  expect(events.filter(e => e.eventType === "COMMAND_REJECTED")).toEqual([]);
  const lock = runtime.exportState().activeLocks[0];
  const frozen: { result: { atkEff: number; defEff: number } } = JSON.parse(lock!.combatResolutionJson!);
  expect(frozen.result.atkEff).toBe(15); expect(frozen.result.defEff).toBeCloseTo(19.5, 6); // 1.5x relics; no factories on either side, so no war-industry 2x
  expect(runtime.getPlayerCombatSummary("p", target)?.relicCombatFacts?.attackMultiplier).toBe(1);
  expect(runtime.getPlayerCombatSummary("q", target)?.relicCombatFacts?.defenseMultiplier).toBe(1);
});

it("waits for a resource reveal and supplies only the persisted allocation to eligible holders", () => {
  const player = buildPlayer("p");
  const empty = () => ({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 });
  const waiting = activateRelic(relicTile("FOUNDRY_HEART"), player, 1000, 0, { supply: empty(), demand: empty() });
  expect(waiting.naturalWonder?.resourceBonus).toBeUndefined();
  player.techIds.add("leatherworking");
  const allocated = activateRelic(waiting, player, 2000, 0, { supply: empty(), demand: empty() });
  expect(allocated.naturalWonder?.resourceBonus).toEqual({ resource: "UMBRITE", amount: 1 });
  expect(allocated.naturalWonder?.activatedAt).toBe(1000);
  const totals = empty(); addRelicResourceSupply(indexedContext([allocated]), player, totals);
  expect(totals).toEqual({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 1, SHARD: 0 });
  const hidden = empty(); addRelicResourceSupply(indexedContext([allocated]), buildPlayer("p"), hidden); expect(hidden.UMBRITE).toBe(0);
});

it("keeps a frontier Resonator dormant without resetting its captured cooldown", () => {
  const tile = { ...relicTile("WATCHTOWER_ENGINE"), ownershipState: "FRONTIER" as const, observatory: { ownerId: "p", status: "active" as const, cooldownUntil: 9999, suppressedUntil: 5000 } };
  syncWatchtowerObservatory(tile);
  expect(tile.observatory).toMatchObject({ status: "inactive", cooldownUntil: 9999, suppressedUntil: 5000 });
  const garrisoned = { ...tile, ownershipState: "SETTLED" as const };
  syncWatchtowerObservatory(garrisoned);
  expect(garrisoned.observatory).toMatchObject({ status: "active", cooldownUntil: 9999, suppressedUntil: 5000 });
});
