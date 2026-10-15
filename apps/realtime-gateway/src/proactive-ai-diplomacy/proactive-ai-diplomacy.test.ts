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
  const fetchSnapshot = vi.fn(async (id: string) => snapshots[id]);
  const hasLiveSocket = vi.fn(() => false);
  const responder = { maybeAutoRespondToSeededAiTruce: vi.fn(async () => {}), maybeAutoRespondToSeededAiAlliance: vi.fn(async () => {}) };
  const recordEvent = vi.fn();
  const deps = { socialState: social, aiPlayerIds: new Set(["ai-1"]), fetchSnapshot, hasLiveSocket, responder, fanout: vi.fn(), recordEvent };
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
    const { deps, social, snapshots } = setup();
    // Both players are seeded AIs here. The recipient is exhausted, so the
    // common-threat alliance is useful to both and accepted by normal stance.
    snapshots.human!.player!.manpower = 10;
    const seeded = new Set(["ai-1", "human"]);
    const order: string[] = [];
    const syncAlliance = vi.fn(async () => { order.push("simulation"); return true; });
    const responder = createSeededAiDiplomacyResponder({
      seededAiPlayerIds: seeded, fetchPlayerSnapshot: deps.fetchSnapshot, requesterSnapshot: deps.fetchSnapshot,
      requesterBrokeTruceWith: () => false, hasLiveSocket: deps.hasLiveSocket,
      acceptTruce: social.acceptTruce, rejectTruce: social.rejectTruce,
      acceptAlliance: social.acceptAlliance, rejectAlliance: social.rejectAlliance,
      syncPlayers: social.syncPlayers, recordGatewayEvent: deps.recordEvent,
      syncAllianceToSimulation: syncAlliance, syncTruceToSimulation: async () => true,
      fanoutPlayerPayloads: () => { order.push("accepted fanout"); }
    });
    const coordinator = createProactiveAiDiplomacy({ ...deps, aiPlayerIds: seeded, responder,
      fanout: () => { order.push("offer fanout"); } });
    await coordinator.tick();
    expect(social.snapshotForPlayer("ai-1").allies).toEqual(["human"]);
    expect(syncAlliance).toHaveBeenCalledWith({ playerId: "human", targetPlayerId: "ai-1", allied: true });
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
  it("finds border neighbors across the world seam", () => {
    expect(aiDiplomacyNeighbors([{ x: 0, y: 0, ownerId: "ai-1" }, { x: WORLD_WIDTH - 1, y: 0, ownerId: "human" }], "ai-1")).toEqual(["human"]);
  });
});
