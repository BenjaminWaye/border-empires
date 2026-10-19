import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSocialState } from "../social-state/social-state.js";
import { InMemoryGatewaySocialStore } from "../social-store/social-store.js";
import { SqliteGatewaySocialStore } from "../social-store/social-store-sqlite.js";
import { buildSocialStateSink } from "../gateway-app/build-social-state-sink.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };
const HOUR = 3_600_000;
const players = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" }];

describe.each(["memory", "sqlite"] as const)("Court mandates (%s)", kind => {
  it("enforces 12h non-breakable truces and a durable 48h caster cooldown", () => {
    let now = 1000;
    const db = kind === "sqlite" ? new DatabaseSync(":memory:") : undefined;
    const store = db ? new SqliteGatewaySocialStore(db, () => now) : new InMemoryGatewaySocialStore(() => now);
    if (store instanceof SqliteGatewaySocialStore) store.applySchema();
    for (const player of players) store.upsertPlayer(player.id, player.name);
    const load = () => createSocialState({ now: () => now, initial: store.loadSnapshot(), sink: buildSocialStateSink(store) });
    let social = load();
    expect(social.forceTruce("a", "b").ok).toBe(true);
    expect(social.snapshotForPlayer("a").activeTruces).toEqual([expect.objectContaining({ otherPlayerId: "b", origin: "court", endsAt: now + 12 * HOUR })]);
    expect(social.breakTruce("b", "a")).toMatchObject({ ok: false, code: "COURT_TRUCE_BINDING" });
    expect(social.forceTruce("a", "c")).toMatchObject({ ok: false, code: "FORCED_TRUCE_COOLDOWN" });
    social = load();
    expect(social.breakTruce("a", "b").ok).toBe(false);
    expect(social.snapshotForPlayer("a").forcedTruceCooldownUntil).toBe(now + 48 * HOUR);
    now += 12 * HOUR;
    expect(social.activeTrucePairs()).toEqual([]);
    expect(social.forceTruce("a", "c").ok).toBe(false);
    expect(social.forceTruce("b", "c").ok).toBe(true);
    now += 36 * HOUR;
    social = load();
    expect(social.forceTruce("a", "b").ok).toBe(true);
    db?.close();
  });
  it("does not charge a rejected mandate or prevent ordinary truce-breaking", () => {
    const social = createSocialState({ now: () => 1000, players });
    expect(social.forceTruce("a", "a").ok).toBe(false);
    expect(social.snapshotForPlayer("a").forcedTruceCooldownUntil).toBeUndefined();
    expect(social.requestTruce("a", "Beta", 12).ok).toBe(true);
    const request = social.snapshotForPlayer("b").incomingTruceRequests[0]!;
    expect(social.acceptTruce("b", request.id).ok).toBe(true);
    expect(social.forceTruce("a", "b")).toMatchObject({ ok: false, code: "TRUCE_EXISTS" });
    expect(social.snapshotForPlayer("a").forcedTruceCooldownUntil).toBeUndefined();
    expect(social.breakTruce("a", "b").ok).toBe(true);
  });
});

describe("Court mandate transaction boundaries", () => {
  it("publishes neither the truce nor its cooldown if the durable transaction fails", () => {
    const db = new DatabaseSync(":memory:");
    const store = new SqliteGatewaySocialStore(db, () => 1000); store.applySchema();
    for (const player of players) store.upsertPlayer(player.id, player.name);
    const social = createSocialState({ now: () => 1000, initial: store.loadSnapshot(), sink: buildSocialStateSink(store) });
    db.exec("CREATE TRIGGER fail_court_cooldown BEFORE INSERT ON social_forced_truce_cooldowns BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    expect(() => social.forceTruce("a", "b")).toThrow("injected failure");
    expect(social.activeTrucePairs()).toEqual([]);
    expect(social.snapshotForPlayer("a").forcedTruceCooldownUntil).toBeUndefined();
    expect(store.loadSnapshot().activeTruces ?? []).toEqual([]);
    expect(store.loadSnapshot().forcedTruceCooldowns ?? []).toEqual([]);
    db.close();
  });
  it("clears campaign-specific mandates and cooldowns at season rollover", () => {
    const store = new InMemoryGatewaySocialStore(() => 1000);
    const social = createSocialState({ now: () => 1000, players, sink: buildSocialStateSink(store) });
    expect(social.forceTruce("a", "b").ok).toBe(true);
    store.clearSeasonData(); social.resetAfcCampaign();
    expect(social.activeTrucePairs()).toEqual([]);
    expect(social.snapshotForPlayer("a").forcedTruceCooldownUntil).toBeUndefined();
    expect(social.forceTruce("a", "c").ok).toBe(true);
  });
});
