import { describe, expect, it } from "vitest";

import { InMemoryPlayerFunnelStore } from "../player-funnel-store/player-funnel-store.js";
import type { SimulationClientEvent } from "../sim-client/sim-client.js";
import { ACQUISITION_BEACONS_PER_MINUTE, SESSION_MERGE_WINDOW_MS, createPlayerFunnelTracker } from "./player-funnel-tracker.js";

const setup = () => {
  let now = 1_000_000;
  const store = new InMemoryPlayerFunnelStore();
  const errors: string[] = [];
  const tracker = createPlayerFunnelTracker({
    store,
    now: () => now,
    isAiPlayerId: (id) => id.startsWith("ai-"),
    onStoreError: (operation) => errors.push(operation)
  });
  const player = async (id: string) => {
    await tracker.idle();
    return (await store.listPlayers()).find((row) => row.playerId === id);
  };
  return { store, tracker, errors, player, advance: (ms: number) => { now += ms; }, at: () => now };
};

const accepted = (playerId: string, actionType = "EXPAND"): SimulationClientEvent => ({
  eventType: "COMMAND_ACCEPTED", commandId: "c1", playerId, actionType, originX: 0, originY: 0, targetX: 1, targetY: 0, resolvesAt: 0
});

const attackResolved = (playerId: string, defenderOwnerId: string): SimulationClientEvent => ({
  eventType: "COMBAT_RESOLVED", commandId: "c2", playerId, actionType: "ATTACK", originX: 0, originY: 0, targetX: 1, targetY: 0, attackerWon: true,
  combatResult: { defenderOwnerId } as NonNullable<Extract<SimulationClientEvent, { eventType: "COMBAT_RESOLVED" }>["combatResult"]>
});

const milestone = (playerId: string, payload: Record<string, unknown>): SimulationClientEvent => ({
  eventType: "PLAYER_MESSAGE", commandId: "m1", playerId, messageType: "ONBOARDING_MILESTONE", payload: { type: "ONBOARDING_MILESTONE", ...payload }
});

describe("player funnel tracker", () => {
  it("marks only brand-new bindings as new accounts", async () => {
    const t = setup();
    t.tracker.onSocketAuthenticated("s1", "p-new", "new");
    t.tracker.onSocketAuthenticated("s2", "p-old", "uid");
    expect((await t.player("p-new"))?.accountNew).toBe(true);
    expect((await t.player("p-old"))?.accountNew).toBe(false);
  });

  it("spans a session from first socket open to last socket close", async () => {
    const t = setup();
    const start = t.at();
    t.tracker.onSocketAuthenticated("s1", "p1", "new");
    t.tracker.onSocketAuthenticated("s2", "p1", "new");
    t.advance(5 * 60_000);
    t.tracker.onSocketClosed("s1");
    t.advance(5 * 60_000);
    t.tracker.onSocketClosed("s2");
    await t.tracker.idle();
    expect(await t.store.listSessions(0)).toEqual([expect.objectContaining({ playerId: "p1", startedAt: start, endedAt: start + 10 * 60_000 })]);
  });

  it("continues the session on a quick reconnect but starts a new one after the merge window", async () => {
    const t = setup();
    t.tracker.onSocketAuthenticated("s1", "p1", "new");
    t.advance(60_000);
    t.tracker.onSocketClosed("s1");
    t.advance(SESSION_MERGE_WINDOW_MS - 1);
    t.tracker.onSocketAuthenticated("s2", "p1", "uid");
    t.advance(60_000);
    t.tracker.onSocketClosed("s2");
    t.advance(SESSION_MERGE_WINDOW_MS + 1);
    t.tracker.onSocketAuthenticated("s3", "p1", "uid");
    await t.tracker.idle();
    expect((await t.store.listSessions(0)).length).toBe(2);
  });

  it("moves lastSeenAt to when the player was last connected, keeping first-seen and new-account state", async () => {
    const t = setup();
    const start = t.at();
    t.tracker.onSocketAuthenticated("s1", "p1", "new");
    t.advance(90_000);
    await t.tracker.flushOpenSessions();
    expect(await t.player("p1")).toEqual(expect.objectContaining({ firstSeenAt: start, lastSeenAt: start + 90_000, accountNew: true }));
    t.advance(60_000);
    t.tracker.onSocketClosed("s1");
    expect((await t.player("p1"))?.lastSeenAt).toBe(start + 150_000);
  });

  it("flushes open sessions so a restart loses at most one interval", async () => {
    const t = setup();
    const start = t.at();
    t.tracker.onSocketAuthenticated("s1", "p1", "new");
    t.advance(90_000);
    await t.tracker.flushOpenSessions();
    expect((await t.store.listSessions(0))[0]?.endedAt).toBe(start + 90_000);
  });

  it("records the first move only for player-submitted, non-rejected commands", async () => {
    const t = setup();
    t.tracker.onSocketAuthenticated("s1", "p1", "new");
    t.tracker.observeSimulationEvent(accepted("p1", "ATTACK"), false);
    t.tracker.observeSimulationEvent({ eventType: "COMMAND_REJECTED", commandId: "c0", playerId: "p1", code: "X", message: "x" }, true);
    expect((await t.player("p1"))?.firstMoveAt).toBeUndefined();
    t.tracker.observeSimulationEvent(accepted("p1", "EXPAND"), true);
    t.advance(1_000);
    t.tracker.observeSimulationEvent(accepted("p1", "ATTACK"), true);
    expect(await t.player("p1")).toEqual(expect.objectContaining({ firstMoveType: "EXPAND" }));
  });

  it("counts attacks and diplomacy with other empires as interaction, never barbarians", async () => {
    const t = setup();
    t.tracker.onSocketAuthenticated("s1", "p1", "new");
    t.tracker.observeSimulationEvent(attackResolved("p1", "barbarian-1"), false);
    t.tracker.onDiplomacyInteraction("p1", undefined, "truce");
    expect((await t.player("p1"))?.firstInteractionAt).toBeUndefined();
    t.tracker.observeSimulationEvent(attackResolved("p1", "ai-3"), false);
    expect(await t.player("p1")).toEqual(expect.objectContaining({ firstInteractionType: "attack", firstInteractionWith: "ai-3", firstInteractionIsAi: true }));
    t.tracker.onSocketAuthenticated("s2", "p2", "new");
    t.tracker.onDiplomacyInteraction("p2", "p1", "alliance");
    expect(await t.player("p2")).toEqual(expect.objectContaining({ firstInteractionType: "alliance", firstInteractionWith: "p1", firstInteractionIsAi: false }));
  });

  it("consumes ONBOARDING_MILESTONE messages and records them", async () => {
    const t = setup();
    t.tracker.onSocketAuthenticated("s1", "p1", "new");
    expect(t.tracker.observeSimulationEvent(milestone("p1", { kind: "TEN_TILES", at: 5, ownedTiles: 10 }), false)).toBe(true);
    expect(t.tracker.observeSimulationEvent(milestone("p1", { kind: "FIRST_CONTACT", at: 6, withPlayerId: "ai-1", withIsAi: true }), false)).toBe(true);
    expect(t.tracker.observeSimulationEvent(accepted("p1"), false)).toBe(false);
    expect(await t.player("p1")).toEqual(expect.objectContaining({ tenTilesAt: 5, firstContactAt: 6, firstContactWith: "ai-1", firstContactIsAi: true }));
  });

  it("ignores milestones for players it has never seen sign in", async () => {
    const t = setup();
    t.tracker.onSpawned("ghost");
    await t.tracker.idle();
    expect(await t.store.listPlayers()).toEqual([]);
  });

  it("validates, dedupes and rate-caps acquisition beacons", async () => {
    const t = setup();
    const beacon = (step: string, visitorId = "visitor-12345") => JSON.stringify({ visitorId, step, detail: { method: "google.com", evil: "x".repeat(500) } });
    expect(t.tracker.recordAcquisitionBeacon(beacon("visit"))).toBe("recorded");
    expect(t.tracker.recordAcquisitionBeacon(beacon("visit"))).toBe("recorded");
    expect(t.tracker.recordAcquisitionBeacon(beacon("not_a_step"))).toBe("invalid");
    expect(t.tracker.recordAcquisitionBeacon(beacon("visit", "bad id!"))).toBe("invalid");
    expect(t.tracker.recordAcquisitionBeacon("{not json")).toBe("invalid");
    await t.tracker.idle();
    const rows = await t.store.listAcquisitionSteps(0);
    expect(rows).toEqual([expect.objectContaining({ step: "visit", detail: { method: "google.com" } })]);
    expect(t.tracker.counters()).toEqual(expect.objectContaining({ beaconRecorded: 1, beaconDuplicate: 1, beaconInvalid: 3 }));
    for (let i = 0; i < ACQUISITION_BEACONS_PER_MINUTE; i += 1) t.tracker.recordAcquisitionBeacon(beacon("visit"));
    expect(t.tracker.recordAcquisitionBeacon(beacon("visit"))).toBe("rate_limited");
    t.advance(60_000);
    expect(t.tracker.recordAcquisitionBeacon(beacon("sign_up"))).toBe("recorded");
  });

  it("never throws into the caller when the store fails", async () => {
    const t = setup();
    t.store.ensurePlayer = async () => { throw new Error("disk full"); };
    expect(() => t.tracker.onSocketAuthenticated("s1", "p1", "new")).not.toThrow();
    await t.tracker.idle();
    expect(t.errors).toEqual(["session:open"]);
    expect(t.tracker.counters().storeErrors).toBe(1);
  });
});
