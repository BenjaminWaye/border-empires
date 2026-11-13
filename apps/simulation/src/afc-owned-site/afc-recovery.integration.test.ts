import { describe, expect, it } from "vitest";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { STARTING_CAPITAL_MANPOWER_CAP } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";

const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const fixture = (options: { gold?: number; losses?: number; ai?: boolean; afc?: boolean } = {}) => {
  let now = 1000;
  let sequence = 0;
  const timers: Array<{ at: number; callback: () => void }> = [];
  const tiles: DomainTileState[] = [];
  for (let x = 5; x <= 35; x++) for (let y = 5; y <= 30; y++) tiles.push({ x, y, terrain: "LAND", ...(x >= 10 && x <= 18 && y >= 10 && y <= 18 ? { ownerId: "p", ownershipState: "SETTLED" as const } : {}) });
  if (options.afc) tiles.find(t => t.x === 10 && t.y === 10)!.afc = { ownerId: "p", status: "active", activatedAt: 0 };
  const enemy = tiles.find(t => t.x === 8 && t.y === 10)!; // outside p's AFC footprint (landmark-super-tile)
  enemy.ownerId = "e"; enemy.ownershipState = "SETTLED";
  enemy.muster = { ownerId: "e", amount: 10_000, mode: "HOLD", updatedAt: 0 };
  tiles.find(t => t.x === 6 && t.y === 10)!.afc = { ownerId: "e", status: "active", activatedAt: 0 };
  for (let x = 6; x <= 9; x++) { const t = tiles.find(t => t.x === x && t.y === 10)!; t.ownerId = "e"; t.ownershipState = "SETTLED"; }
  const runtime = new SimulationRuntime({ now: () => now,
    scheduleAfter: (delay, callback) => { if (delay === 0) callback(); else timers.push({ at: now + delay, callback }); },
    initialPlayers: new Map([["p", buildPlayer("p", { isAi: options.ai ?? false, points: options.gold ?? 500, manpower: 1000, waystationManpowerOverflow: 1000, landingReserveGranted: true })], ["e", buildPlayer("e", { points: 500, manpower: 10000, waystationManpowerOverflow: 10000, mods: { attack: 1000, defense: 1, income: 1, vision: 1 } })]]),
    seedTiles: new Map(), initialState: { tiles, activeLocks: [], afcGlobalLosses: options.losses ?? 1 } });
  const events = collectEvents(runtime);
  const submit = async (type: CommandEnvelope["type"], payload: object, playerId = "p"): Promise<string> => {
    const commandId = `recovery-${++sequence}`;
    runtime.submitCommand({ type, commandId, playerId, sessionId: "recovery-test", clientSeq: sequence, issuedAt: now, payloadJson: JSON.stringify(payload) });
    await flush(); return commandId;
  };
  const player = () => runtime.exportState().players.find(p => p.id === "p")!;
  const advance = (at: number): void => { now = at; runtime.tickAetherShields(now); };
  const runDue = (): void => {
    for (const task of timers.splice(0)) { if (task.at <= now) task.callback(); else timers.push(task); }
  };
  return { runtime, events, submit, player, advance, runDue, setNow: (at: number) => { now = at; } };
};

describe("AFC replacement delivery", () => {
  it("reserves the global quote, blocks duplicate orders and fabrication, then lands only after 60 seconds", async () => {
    const f = fixture({ losses: 5 });
    await f.submit("BUILD_AFC", { x: 15, y: 15 });
    expect(f.player().points).toBe(440);
    expect(f.events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "recovery-1" }));
    expect(f.player().afcRecovery?.pending).toMatchObject({ cost: 60, arrivesAt: 61000 });
    expect(f.runtime.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
    expect(f.player().manpowerCap).toBe(0);
    await f.submit("BUILD_AFC", { x: 16, y: 16 });
    expect(f.player().points).toBe(440);
    await f.submit("BUILD_FORT", { x: 17, y: 17 });
    expect(f.events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "AFC_REQUIRED" }));
    f.advance(60999);
    expect(f.runtime.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
    f.advance(61000);
    expect(f.runtime.exportState().tiles.find(t => t.x === 15 && t.y === 15)?.afcJson).toContain('"status":"active"');
    expect(f.player().afcRecovery?.pending).toBeUndefined();
    expect(f.player().afcRecovery?.requiredSince).toBeUndefined();
    expect(f.player().points).toBe(440);
    expect(f.player().manpower).toBeLessThanOrEqual(1000); // no new landing reserve
  });

  it("does not refill restored capacity when landing claims new frontier around the footprint", async () => {
    const f = fixture();
    await f.submit("BUILD_AFC", { x: 10, y: 15 });
    const before = f.player().manpower;
    f.advance(61000);
    expect(f.runtime.exportState().tiles.find(t => t.x === 9 && t.y === 15)?.ownerId).toBe("p");
    expect(f.player().manpower).toBe(before);
  });

  it("does not charge or place a second AFC when an accepted order is retried after landing", async () => {
    const f = fixture();
    const command: CommandEnvelope = { type: "BUILD_AFC", commandId: "retry-delivery", playerId: "p", sessionId: "session-retry", clientSeq: 1, issuedAt: 1000, payloadJson: JSON.stringify({ x: 15, y: 15 }) };
    f.runtime.submitCommand(command); await flush();
    f.advance(61000);
    const balance = f.player().points;
    const eventCount = f.events.length;
    f.runtime.submitCommand(command); await flush();
    expect(f.events.slice(eventCount).every(event => event.eventType === "COMMAND_RESOLVED")).toBe(true);
    expect(f.player().points).toBe(balance);
    expect(f.runtime.exportState().tiles.filter(t => t.ownerId === "p" && t.afcJson)).toHaveLength(1);
    expect(f.player().afcRecovery?.pending).toBeUndefined();
  });

  it("refunds an invalidated site and requires a fresh 60-second countdown", async () => {
    const f = fixture();
    await f.submit("BUILD_AFC", { x: 15, y: 15 });
    f.setNow(10000);
    await f.submit("UNCAPTURE_TILE", { x: 15, y: 15 });
    f.advance(10000);
    expect(f.player().points).toBe(500);
    expect(f.player().afcRecovery).toMatchObject({ globalLosses: 1, requiredSince: 10000, cancellation: expect.stringContaining("Landing site lost") });
    expect(f.player().afcRecovery?.pending).toBeUndefined();
    await f.submit("BUILD_AFC", { x: 16, y: 16 });
    expect(f.player().afcRecovery?.pending?.arrivesAt).toBe(70000);
    f.advance(61000);
    expect(f.runtime.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
  });

  it("does not manufacture an AFC when settlement relocation fails but land remains", () => {
    const f = fixture();
    expect(f.runtime["respawnPlayerOnUnownedLand"]("p", "failed-relocation")).toBe(false);
    expect(f.runtime.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
  });

  it("rejects unaffordable deliveries without spending or creating an AFC", async () => {
    const f = fixture({ gold: 19 });
    await f.submit("BUILD_AFC", { x: 15, y: 15 });
    expect(f.player().points).toBe(19);
    expect(f.player().afcRecovery?.pending).toBeUndefined();
    expect(f.events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", message: expect.stringContaining("20 gold") }));
  });

  it("persists the exact quote and arrival through snapshot and event recovery", async () => {
    const f = fixture({ losses: 10 });
    const before = f.runtime.exportSnapshotSections().initialState;
    await f.submit("BUILD_AFC", { x: 15, y: 15 });
    const saved = f.runtime.exportSnapshotSections().initialState;
    const replayed = applySimulationEventsToRecoveredState(before, f.events);
    expect(saved.afcGlobalLosses).toBe(10);
    expect(replayed.afcGlobalLosses).toBe(10);
    expect(replayed.players?.find(p => p.id === "p")?.afcRecovery).toEqual(saved.players?.find(p => p.id === "p")?.afcRecovery);
    const restored = new SimulationRuntime({ now: () => 60999, scheduleAfter: () => undefined, initialState: saved });
    expect(restored.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
    restored.tickAetherShields(60999);
    expect(restored.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
    restored.tickAetherShields(61000);
    expect(restored.exportState().tiles.find(t => t.x === 15 && t.y === 15)?.afcJson).toBeDefined();
    expect(restored.exportState().players.find(p => p.id === "p")?.points).toBe(390);
  });

  it("counts an actual captured AFC once globally and opens recovery for its former owner", async () => {
    const f = fixture({ afc: true, losses: 0 });
    const before = f.runtime.exportSnapshotSections().initialState;
    const id = await f.submit("ATTACK", { fromX: 8, fromY: 10, toX: 9, toY: 10 }, "e"); // aimed at a footprint tile, lands on the AFC
    const lock = f.runtime.exportSnapshotSections().initialState.activeLocks.find(l => l.commandId === id);
    expect(f.events.filter(e => e.eventType === "COMMAND_REJECTED")).toEqual([]);
    expect(lock).toBeDefined();
    f.setNow(lock!.resolvesAt);
    f.runDue(); await flush();
    expect(f.events.filter(e => e.eventType === "COMBAT_RESOLVED")).toContainEqual(expect.objectContaining({ attackerWon: true }));
    expect(f.runtime.exportSnapshotSections().initialState.afcGlobalLosses).toBe(1);
    expect(f.player().afcRecovery?.requiredSince).toBeDefined();
    expect(f.player().manpowerCap).toBe(0);
    expect(f.player().manpower).toBeGreaterThan(0);
    const replayed = applySimulationEventsToRecoveredState(before, f.events);
    expect(replayed.afcGlobalLosses).toBe(1);
    expect(replayed.players?.find(p => p.id === "p")?.points).toBe(f.player().points);
    expect(f.runtime.exportState().tiles.filter(t => t.ownerId === "p" && t.afcJson)).toHaveLength(0);
    expect(f.events).toContainEqual(expect.objectContaining({ eventType: "DOMAIN_UPDATE", playerId: "p", payloadJson: expect.stringContaining('"globalLosses":1') }));
  });

  it("AI explicitly orders and pays for a replacement with the same landing delay", () => {
    const f = fixture({ ai: true, losses: 5 });
    expect(f.runtime.ensurePlayerHasAfc("p")).toBe(false);
    expect(f.runtime.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
    f.advance(1000);
    expect(f.player().afcRecovery?.pending).toMatchObject({ cost: 60, arrivesAt: 61000 });
    expect(f.player().points).toBe(440);
    f.advance(60999);
    expect(f.runtime.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
    f.advance(61000);
    expect(f.runtime.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(true);
  });

  it("refunds a pending delivery if another operational AFC has been secured", async () => {
    const f = fixture();
    await f.submit("BUILD_AFC", { x: 15, y: 15 });
    const saved = f.runtime.exportSnapshotSections().initialState;
    saved.tiles.find(t => t.x === 12 && t.y === 12)!.afc = { ownerId: "p", status: "active", activatedAt: 2000 };
    const restored = new SimulationRuntime({ now: () => 2000, scheduleAfter: () => undefined, initialState: saved });
    restored.tickAetherShields(2000);
    const player = restored.exportState().players.find(p => p.id === "p")!;
    expect(player.afcRecovery?.pending).toBeUndefined();
    expect(player.afcRecovery?.requiredSince).toBeUndefined();
    expect(player.points).toBe(500);
    expect(restored.exportState().tiles.filter(t => t.ownerId === "p" && t.afcJson)).toHaveLength(1);
  });

  it("an unfunded AI does not receive a free replacement", () => {
    const f = fixture({ ai: true, gold: 10 });
    f.advance(1000); f.advance(61000);
    expect(f.player().afcRecovery?.pending).toBeUndefined();
    expect(f.runtime.exportState().tiles.some(t => t.ownerId === "p" && t.afcJson)).toBe(false);
  });

  it("withdrawal forfeits territory and treasury and gives an opening landing", async () => {
    const f = fixture();
    await f.submit("BUILD_AFC", { x: 15, y: 15 });
    await f.submit("WITHDRAW_AND_REDEPLOY", {});
    expect(f.player().afcRecovery?.pending).toBeUndefined();
    expect(f.player().points).toBeLessThan(500);
    expect(f.runtime.exportState().tiles.find(t => t.x === 15 && t.y === 15)?.ownerId).not.toBe("p");
    expect(f.runtime.exportState().tiles.filter(t => t.ownerId === "p" && t.afcJson)).toHaveLength(1);
    expect(f.player().manpower).toBeGreaterThanOrEqual(STARTING_CAPITAL_MANPOWER_CAP);
    expect(f.runtime.exportSnapshotSections().initialState.afcGlobalLosses).toBe(1);
  });
});
