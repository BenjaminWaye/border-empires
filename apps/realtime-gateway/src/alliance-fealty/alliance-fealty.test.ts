// Owner decision 2026-11-27: an alliance offer's fealty is recorded when it is
// sent and carried onto the alliance, so the wording never follows later size
// changes (playtest run 5: an equal offer to a House that shrank read
// "Fealty demanded"). Covers recording, carrying, persistence and old rows.
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { describe, expect, it } from "vitest";

import type { SeasonSizes } from "../ai-diplomacy-stance/ai-alliance-bloc.js";
import { buildGatewaySocialState } from "../gateway-app/build-social-state-sink.js";
import { createSocialState } from "../social-state/social-state.js";
import { SqliteGatewaySocialStore } from "../social-store/social-store-sqlite.js";
import { fealtyLookupFromSizes } from "./alliance-fealty-lookup.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

const players = [{ id: "small", name: "Small" }, { id: "big", name: "Big" }, { id: "peer", name: "Peer" }];

describe("fealtyLookupFromSizes", () => {
  it("names the clearly larger House liege, near-equals and unknown sizes none", () => {
    const sizes: SeasonSizes = { tiles: [{ id: "big", tiles: 900 }, { id: "small", tiles: 40 }, { id: "peer", tiles: 60 }] };
    const lookup = fealtyLookupFromSizes(() => sizes);
    expect(lookup("small", "big")).toEqual({ liegePlayerId: "big" });
    expect(lookup("big", "small")).toEqual({ liegePlayerId: "big" });
    expect(lookup("small", "peer")).toEqual({ liegePlayerId: null });
    expect(lookup("small", "unranked")).toEqual({ liegePlayerId: null });
    expect(fealtyLookupFromSizes(() => undefined)("small", "big")).toEqual({ liegePlayerId: null });
  });
});

describe("recorded alliance fealty", () => {
  it("records the standing at send time and keeps it when sizes change", () => {
    let sizes: SeasonSizes = { tiles: [{ id: "small", tiles: 60 }, { id: "peer", tiles: 50 }] };
    const social = createSocialState({ now: () => 1_000, players });
    social.setFealtyLookup(fealtyLookupFromSizes(() => sizes));
    expect(social.requestAlliance("small", "Peer").ok).toBe(true);
    // Peer shrinks after the offer went out: the offer still reads as equals.
    sizes = { tiles: [{ id: "small", tiles: 60 }, { id: "peer", tiles: 5 }] };
    expect(social.snapshotForPlayer("small").outgoingAllianceRequests[0]?.fealty).toEqual({ liegePlayerId: null });
    expect(social.snapshotForPlayer("peer").incomingAllianceRequests[0]?.fealty).toEqual({ liegePlayerId: null });
  });

  it("carries the offer's fealty onto the alliance and into the Chronicle rows, and drops it when the alliance ends", () => {
    let now = 1_000;
    const social = createSocialState({ now: () => now, players });
    social.setFealtyLookup(() => ({ liegePlayerId: "big" }));
    expect(social.requestAlliance("small", "Big").ok).toBe(true);
    const requestId = social.snapshotForPlayer("big").incomingAllianceRequests[0]!.id;
    expect(social.acceptAlliance("big", requestId).ok).toBe(true);
    expect(social.snapshotForPlayer("small").allianceFealty).toEqual({ big: { liegePlayerId: "big" } });
    expect(social.snapshotForPlayer("big").allianceFealty).toEqual({ small: { liegePlayerId: "big" } });
    const cards = social.diplomacyActivityCards("small", 0, now);
    expect(cards.find((card) => card.event === "ALLIANCE_OFFERED")?.fealty).toEqual({ liegePlayerId: "big" });
    expect(cards.find((card) => card.event === "ALLIANCE_FORMED")?.fealty).toEqual({ liegePlayerId: "big" });

    expect(social.breakAlliance("small", "big").ok).toBe(true);
    now += 25 * 60 * 60_000;
    social.finalizeExpiredAllianceBreaks();
    expect(social.snapshotForPlayer("small").allianceFealty).toEqual({});
  });

  it("sends each ally's fealty in ALLIANCE_UPDATE", () => {
    const social = createSocialState({ now: () => 1_000, players });
    social.setFealtyLookup(() => ({ liegePlayerId: "big" }));
    social.requestAlliance("small", "Big");
    const requestId = social.snapshotForPlayer("big").incomingAllianceRequests[0]!.id;
    const accepted = social.acceptAlliance("big", requestId);
    if (!accepted.ok) throw new Error("accept failed");
    const update = (accepted.payloadsByPlayerId.get("small") ?? []).find((payload) => (payload as { type?: string }).type === "ALLIANCE_UPDATE");
    expect(update).toMatchObject({ allies: ["big"], allianceFealty: { big: { liegePlayerId: "big" } } });
  });

  it("persists offers, alliances and Chronicle rows across a restart", () => {
    const db = new DatabaseSync(":memory:");
    const store = new SqliteGatewaySocialStore(db, () => 1_000);
    store.applySchema();
    for (const player of players) store.upsertPlayer(player.id, player.name);
    const before = buildGatewaySocialState(store, store.loadSnapshot(), players, () => 1_000);
    before.setFealtyLookup((fromId, toId) => ({ liegePlayerId: fromId === "small" ? toId : null }));
    before.requestAlliance("small", "Big");
    before.requestAlliance("small", "Peer");
    const requestId = before.snapshotForPlayer("big").incomingAllianceRequests[0]!.id;
    expect(before.acceptAlliance("big", requestId).ok).toBe(true);

    store.applySchema();
    const after = buildGatewaySocialState(store, store.loadSnapshot(), players, () => 1_000);
    expect(after.snapshotForPlayer("small").allianceFealty).toEqual({ big: { liegePlayerId: "big" } });
    expect(after.snapshotForPlayer("small").outgoingAllianceRequests[0]?.fealty).toEqual({ liegePlayerId: "peer" });
    expect(after.diplomacyActivityCards("small", 0, 1_000).find((card) => card.event === "ALLIANCE_FORMED")?.fealty).toEqual({ liegePlayerId: "big" });
  });

  it("leaves offers and alliances from before the field existed unrecorded", () => {
    const db = new DatabaseSync(":memory:");
    // The tables as they shipped before fealty_json.
    db.exec(`CREATE TABLE social_alliances (player_a_id TEXT NOT NULL, player_b_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (player_a_id, player_b_id));
      CREATE TABLE social_alliance_requests (id TEXT PRIMARY KEY, from_player_id TEXT NOT NULL, to_player_id TEXT NOT NULL, created_at INTEGER NOT NULL, from_name TEXT, to_name TEXT);
      INSERT INTO social_alliances VALUES ('big', 'small', 1);
      INSERT INTO social_alliance_requests VALUES ('old', 'small', 'peer', 1, 'Small', 'Peer');`);
    const store = new SqliteGatewaySocialStore(db, () => 1_000);
    store.applySchema();
    store.upsertPlayer("small", "Small");
    const social = buildGatewaySocialState(store, store.loadSnapshot(), players, () => 1_000);
    expect(social.snapshotForPlayer("small").allies).toEqual(["big"]);
    expect(social.snapshotForPlayer("small").allianceFealty).toEqual({});
    expect(social.snapshotForPlayer("small").outgoingAllianceRequests[0]).not.toHaveProperty("fealty");
  });
});
