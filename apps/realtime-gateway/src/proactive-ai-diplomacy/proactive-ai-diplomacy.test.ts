import { createAiDiplomacyMemory } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { describe, expect, it, vi } from "vitest";
import { createSocialState } from "../social-state/social-state.js";
import { createProactiveAiDiplomacy, aiDiplomacyNeighbors } from "./proactive-ai-diplomacy.js";
import type { AiDiplomacySnapshot } from "../ai-diplomacy-stance/ai-diplomacy-stance-input.js";
import { createSeededAiDiplomacyResponder } from "../seeded-ai-diplomacy-responder/seeded-ai-diplomacy-responder.js";
import { WORLD_WIDTH } from "@border-empires/shared";

const tiles = [
  { x: 0, y: 0, ownerId: "ai-1" }, { x: 0, y: 1, ownerId: "ai-1" },
  { x: 1, y: 0, ownerId: "human" }, { x: 1, y: 1, ownerId: "barbarian-1" }
];
function setup(manpower = 900) {
  const social = createSocialState({ players: [{ id: "ai-1", name: "Alden" }, { id: "human", name: "Human" }] });
  const snapshots: Record<string, AiDiplomacySnapshot> = {
    "ai-1": { playerId: "ai-1", player: { name: "Alden", manpower, manpowerCap: 1000 }, tiles },
    human: { playerId: "human", player: { name: "Human", manpower: 800, manpowerCap: 1000 }, tiles }
  };
  const memory = createAiDiplomacyMemory({ now: () => Date.now(), isAi: () => true });
  memory.recordPayment("ai-1", "human", 6000);
  const diplomacyContext = (requesterId: string, aiId: string) => ({ requesterBrokeTruceWithAi: false,
    requesterTruceBreaksWithOthers: 0, memory: memory.view(aiId, requesterId), now: Date.now(),
    alliesOf: (id: string) => social.snapshotForPlayer(id).allies });
  for (const snapshot of Object.values(snapshots)) {
    snapshot.worldStatus = { leaderboard: { overall: [{ id: "ai-1", tiles: 2 }, { id: "human", tiles: 1 }] } };
    snapshot.player!.incomePerMinute = 1;
  }
  const fetchSnapshot = vi.fn(async (id: string) => snapshots[id]);
  const hasLiveSocket = vi.fn(() => false);
  const responder = { maybeAutoRespondToSeededAiTruce: vi.fn(async () => {}), maybeAutoRespondToSeededAiAlliance: vi.fn(async () => {}) };
  const recordEvent = vi.fn();
  const deps = { diplomacyContext, socialState: social, aiPlayerIds: new Set(["ai-1"]), fetchSnapshot, hasLiveSocket, responder, fanout: vi.fn(), recordEvent };
  return { social, snapshots, deps, coordinator: createProactiveAiDiplomacy(deps) };
}

describe("proactive AI diplomacy", () => {
  it("offers one 12h truce when armies are spent and does not spam outstanding offers", async () => {
    const { coordinator, social, deps } = setup(10);
    await coordinator.tick();
    const pending = social.snapshotForPlayer("human").incomingTruceRequests;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ fromPlayerId: "ai-1", durationHours: 12 });
    expect(deps.responder.maybeAutoRespondToSeededAiTruce).toHaveBeenCalledOnce();
    await coordinator.tick();
    expect(social.snapshotForPlayer("human").incomingTruceRequests).toHaveLength(1);
  });
  it("offers an alliance for a shared threat when it retains bloc leadership", async () => {
    const { coordinator, social } = setup();
    await coordinator.tick();
    expect(social.snapshotForPlayer("human").incomingAllianceRequests).toHaveLength(1);
  });
  it("does not knowingly hand bloc leadership to a larger neighbor", async () => {
    const { coordinator, social, snapshots } = setup();
    snapshots.human!.tiles = [...tiles, { x: 2, y: 0, ownerId: "human" }, { x: 2, y: 1, ownerId: "human" }];
    await coordinator.tick();
    expect(social.snapshotForPlayer("human").incomingAllianceRequests).toHaveLength(0);
  });
  it("does not initiate offers for a human-controlled seeded identity", async () => {
    const { coordinator, deps } = setup(10);
    deps.hasLiveSocket.mockReturnValue(true);
    await coordinator.tick();
    expect(deps.fetchSnapshot).not.toHaveBeenCalled();
  });
  it("respects decline cooldowns", async () => {
    const { coordinator, social } = setup(10);
    await coordinator.tick();
    const request = social.snapshotForPlayer("human").incomingTruceRequests[0]!;
    expect(social.rejectTruce("human", request.id).ok).toBe(true);
    await coordinator.tick();
    expect(social.snapshotForPlayer("human").incomingTruceRequests).toHaveLength(0);
  });
  it("excludes allies and active truces from offer targets", async () => {
    const { coordinator, social } = setup(10);
    await coordinator.tick();
    const request = social.snapshotForPlayer("human").incomingTruceRequests[0]!;
    social.acceptTruce("human", request.id);
    await coordinator.tick();
    expect(social.snapshotForPlayer("human").incomingTruceRequests).toHaveLength(0);
  });
  it("cancels an in-flight tick when the gateway closes", async () => {
    const { deps, social } = setup(10);
    let finish: (value: AiDiplomacySnapshot | undefined) => void = () => {};
    const waiting = new Promise<AiDiplomacySnapshot | undefined>(resolve => { finish = resolve; });
    const source = await deps.fetchSnapshot("ai-1");
    const coordinator = createProactiveAiDiplomacy({ ...deps, fetchSnapshot: () => waiting });
    const tick = coordinator.tick();
    coordinator.stop(); finish(source);
    await tick;
    expect(social.snapshotForPlayer("human").incomingTruceRequests).toHaveLength(0);
  });
  it("continues after a transient snapshot failure without overlapping ticks", async () => {
    const { coordinator, deps } = setup(10);
    deps.fetchSnapshot.mockRejectedValueOnce(new Error("offline"));
    await coordinator.tick();
    expect(deps.recordEvent).toHaveBeenCalledWith("warn", "gateway_ai_diplomacy_tick_failed", expect.any(Object));
    await coordinator.tick();
    expect(deps.responder.maybeAutoRespondToSeededAiTruce).toHaveBeenCalledOnce();
  });
  it("runs AI-to-AI acceptance through the responder and syncs before accepted fanout", async () => {
    const { deps, social, snapshots } = setup(10);
    // Both players are seeded AIs here. The recipient is exhausted, so the
    // at war and exhausted, and the recipient already paid this war.
    snapshots.human!.player!.manpower = 10;
    const seeded = new Set(["ai-1", "human"]);
    const order: string[] = [];
    const syncTruce = vi.fn(async () => { order.push("simulation"); return true; });
    const responder = createSeededAiDiplomacyResponder({
      seededAiPlayerIds: seeded, fetchPlayerSnapshot: deps.fetchSnapshot, requesterSnapshot: deps.fetchSnapshot,
      diplomacyContext: (requester, ai) => { const context = deps.diplomacyContext(requester, ai);
        return { ...context, memory: { ...context.memory, lastCombatAt: Date.now(), aiAlreadyPaidThisWar: true } }; },
      hasLiveSocket: deps.hasLiveSocket,
      acceptTruce: async (...args) => social.acceptTruce(...args), rejectTruce: social.rejectTruce,
      acceptAlliance: async (...args) => social.acceptAlliance(...args), rejectAlliance: social.rejectAlliance,
      syncPlayers: social.syncPlayers, recordGatewayEvent: deps.recordEvent,
      requestTruce: social.requestTruce, requestAlliance: social.requestAlliance,
      syncAllianceToSimulation: async () => true, syncTruceToSimulation: syncTruce,
      fanoutPlayerPayloads: () => { order.push("accepted fanout"); }
    });
    const coordinator = createProactiveAiDiplomacy({ ...deps, aiPlayerIds: seeded, responder,
      fanout: () => { order.push("offer fanout"); } });
    await coordinator.tick();
    expect(social.snapshotForPlayer("ai-1").activeTruces).toHaveLength(1);
    expect(syncTruce).toHaveBeenCalledWith({ playerId: "human", targetPlayerId: "ai-1", truced: true });
    expect(order).toEqual(["offer fanout", "simulation", "accepted fanout"]);
  });
  it("rechecks human control after an awaited snapshot and prevents overlapping evaluation", async () => {
    const { deps, social } = setup(10);
    let finish: (value: AiDiplomacySnapshot | undefined) => void = () => {};
    const source = await deps.fetchSnapshot("ai-1");
    const fetchSnapshot = vi.fn(() => new Promise<AiDiplomacySnapshot | undefined>(resolve => { finish = resolve; }));
    const coordinator = createProactiveAiDiplomacy({ ...deps, fetchSnapshot });
    const first = coordinator.tick();
    await coordinator.tick();
    expect(fetchSnapshot).toHaveBeenCalledOnce();
    deps.hasLiveSocket.mockReturnValue(true); finish(source);
    await first;
    expect(social.snapshotForPlayer("human").incomingTruceRequests).toHaveLength(0);
  });
  it("honors the whole merged bloc rather than just the neighboring empire", async () => {
    const { social, snapshots, coordinator } = setup();
    social.registerPlayer("giant", "Giant");
    social.requestAlliance("human", "Giant");
    const request = social.snapshotForPlayer("giant").incomingAllianceRequests[0]!;
    expect(social.acceptAlliance("giant", request.id).ok).toBe(true);
    snapshots["ai-1"]!.worldStatus!.leaderboard.overall = [{ id: "ai-1", tiles: 2 }, { id: "human", tiles: 1 }, { id: "giant", tiles: 100 }];
    await coordinator.tick();
    expect(social.snapshotForPlayer("human").incomingAllianceRequests).toHaveLength(0);
  });
  it("honors attitude and recent-attack refusals from the shared evaluator", async () => {
    for (const manpower of [900, 10]) {
      const { deps, social } = setup(manpower);
      const coordinator = createProactiveAiDiplomacy({ ...deps, diplomacyContext: (requester, ai) => {
        const context = deps.diplomacyContext(requester, ai);
        return { ...context, memory: { ...context.memory, goodwillCoin: 0, ...(manpower === 10 ? { lastPlayerAttackAt: Date.now() } : {}) } };
      } });
      await coordinator.tick();
      expect(social.snapshotForPlayer("human").incomingAllianceRequests).toHaveLength(0);
      expect(social.snapshotForPlayer("human").incomingTruceRequests).toHaveLength(0);
    }
  });
  it("finds border neighbors across the world seam", () => {
    expect(aiDiplomacyNeighbors([{ x: 0, y: 0, ownerId: "ai-1" }, { x: WORLD_WIDTH - 1, y: 0, ownerId: "human" }], "ai-1")).toEqual(["human"]);
  });
});
