import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";
import { InMemoryGatewaySocialStore, type GatewaySocialStore } from "./social-store.js";

const buildSink = (store: GatewaySocialStore) => ({
  upsertPlayer: (playerId: string, name: string) => store.upsertPlayer(playerId, name),
  saveAllianceRequest: (request: Parameters<GatewaySocialStore["saveAllianceRequest"]>[0]) =>
    store.saveAllianceRequest(request),
  deleteAllianceRequest: (id: string) => store.deleteAllianceRequest(id),
  saveTruceRequest: (request: Parameters<GatewaySocialStore["saveTruceRequest"]>[0]) => store.saveTruceRequest(request),
  deleteTruceRequest: (id: string) => store.deleteTruceRequest(id),
  addAlliance: (a: string, b: string, t: number) => store.addAlliance(a, b, t),
  removeAlliance: (a: string, b: string) => store.removeAlliance(a, b),
  saveActiveTruce: (truce: Parameters<GatewaySocialStore["saveActiveTruce"]>[0]) => store.saveActiveTruce(truce),
  removeActiveTruce: (a: string, b: string) => store.removeActiveTruce(a, b),
  pruneExpired: (now: number) => store.pruneExpired(now)
});

describe("InMemoryGatewaySocialStore + createSocialState", () => {
  it("survives a restart with pending alliance request", () => {
    const store = new InMemoryGatewaySocialStore();
    const sink = buildSink(store);
    const before = createSocialState({
      now: () => 1_000,
      sink,
      initial: store.loadSnapshot()
    });
    before.registerPlayer("player-1", "Nauticus");
    before.registerPlayer("player-2", "Steamopolis");

    expect(before.requestAlliance("player-1", "Steamopolis").ok).toBe(true);

    // Restart: new socialState reading from the same persistent store.
    const after = createSocialState({
      now: () => 1_500,
      sink,
      initial: store.loadSnapshot()
    });

    const incoming = after.snapshotForPlayer("player-2").incomingAllianceRequests;
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toEqual(
      expect.objectContaining({ fromPlayerId: "player-1", toPlayerId: "player-2" })
    );

    const accepted = after.acceptAlliance("player-2", incoming[0]!.id);
    expect(accepted.ok).toBe(true);

    const final = createSocialState({
      now: () => 2_000,
      sink,
      initial: store.loadSnapshot()
    });
    expect(final.snapshotForPlayer("player-1").allies).toEqual(["player-2"]);
    expect(final.snapshotForPlayer("player-2").allies).toEqual(["player-1"]);
    expect(final.snapshotForPlayer("player-2").incomingAllianceRequests).toEqual([]);
  });

  it("resolves an offline-by-name target after restart", () => {
    const store = new InMemoryGatewaySocialStore();
    const sink = buildSink(store);
    const before = createSocialState({
      now: () => 1_000,
      sink,
      initial: store.loadSnapshot()
    });
    before.registerPlayer("player-A", "Aria");
    before.registerPlayer("player-B", "Beren");

    // Restart: only Beren reconnects; Aria is offline. The persisted player table
    // must still let resolveByName find her.
    const after = createSocialState({
      now: () => 2_000,
      sink,
      initial: store.loadSnapshot()
    });
    after.registerPlayer("player-B", "Beren");

    const result = after.requestAlliance("player-B", "Aria");
    expect(result.ok).toBe(true);
  });

  it("persists truce request + active truce across restart and prunes on expiry", () => {
    const store = new InMemoryGatewaySocialStore();
    const sink = buildSink(store);
    let nowMs = 1_000;
    const before = createSocialState({
      now: () => nowMs,
      sink,
      initial: store.loadSnapshot()
    });
    before.registerPlayer("player-1", "Nauticus");
    before.registerPlayer("player-2", "Steamopolis");

    expect(before.requestTruce("player-1", "Steamopolis", 12).ok).toBe(true);

    const after = createSocialState({
      now: () => nowMs,
      sink,
      initial: store.loadSnapshot()
    });
    const pending = after.snapshotForPlayer("player-2").incomingTruceRequests;
    expect(pending).toHaveLength(1);
    expect(after.acceptTruce("player-2", pending[0]!.id).ok).toBe(true);

    const stillActive = createSocialState({
      now: () => nowMs,
      sink,
      initial: store.loadSnapshot()
    });
    expect(stillActive.snapshotForPlayer("player-1").activeTruces).toHaveLength(1);

    nowMs = 1_000 + 13 * 60 * 60_000;
    const afterExpiry = createSocialState({
      now: () => nowMs,
      sink,
      initial: store.loadSnapshot()
    });
    expect(afterExpiry.snapshotForPlayer("player-1").activeTruces).toEqual([]);

    const reloaded = store.loadSnapshot();
    expect(reloaded.activeTruces).toEqual([]);
  });

  it("removes alliance and prunes request rows", () => {
    const store = new InMemoryGatewaySocialStore();
    const sink = buildSink(store);
    const social = createSocialState({
      now: () => 1_000,
      sink,
      initial: store.loadSnapshot()
    });
    social.registerPlayer("player-1", "A");
    social.registerPlayer("player-2", "B");
    social.requestAlliance("player-1", "B");
    const reqId = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]?.id;
    expect(reqId).toBeTruthy();
    social.acceptAlliance("player-2", reqId!);
    // request gone in store
    expect(store.loadSnapshot().allianceRequests).toEqual([]);
    // alliance present in store (via player allies hydration)
    expect(store.loadSnapshot().players.find((p) => p.id === "player-1")?.allies).toEqual(["player-2"]);

    social.breakAlliance("player-1", "player-2");
    expect(store.loadSnapshot().players.find((p) => p.id === "player-1")?.allies).toEqual([]);
  });
});
