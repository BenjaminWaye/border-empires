import { describe, expect, it } from "vitest";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { applyNonTileEventToCache, createPlayerSnapshotCache } from "./player-snapshot-cache.js";

const snapshotWith = (tiles: Array<{ x: number; y: number }>): PlayerSubscriptionSnapshot =>
  ({ playerId: "player-1", tiles } as unknown as PlayerSubscriptionSnapshot);

describe("createPlayerSnapshotCache", () => {
  it("serves an entry stored at the current revision", () => {
    const cache = createPlayerSnapshotCache();
    const snapshot = snapshotWith([{ x: 1, y: 1 }]);
    cache.set("player-1", snapshot);

    expect(cache.getCurrent("player-1")).toBe(snapshot);
    expect(cache.staleReadCount()).toBe(0);
  });

  it("returns undefined for a missing entry without counting a stale read", () => {
    const cache = createPlayerSnapshotCache();

    expect(cache.getCurrent("nobody")).toBeUndefined();
    expect(cache.staleReadCount()).toBe(0);
  });

  // The bug: an outpost built while the player was unsubscribed advanced the
  // world revision, but nothing re-stamped their entry. Serving it as INIT is
  // what left the vision disc permanently unrevealed on the client.
  it("refuses to serve an entry that missed a tile-delta batch", () => {
    const cache = createPlayerSnapshotCache();
    cache.set("offline-player", snapshotWith([{ x: 1, y: 1 }]));

    cache.bumpWorldRevision();

    expect(cache.getCurrent("offline-player")).toBeUndefined();
    expect(cache.staleReadCount()).toBe(1);
  });

  it("still exposes a stale entry via peek for revision-independent reads", () => {
    const cache = createPlayerSnapshotCache();
    const snapshot = snapshotWith([{ x: 1, y: 1 }]);
    cache.set("offline-player", snapshot);
    cache.bumpWorldRevision();

    expect(cache.peek("offline-player")).toBe(snapshot);
  });

  it("keeps serving a subscribed player whose snapshot was updated with the batch", () => {
    const cache = createPlayerSnapshotCache();
    cache.set("player-1", snapshotWith([{ x: 1, y: 1 }]));

    cache.bumpWorldRevision();
    const updated = snapshotWith([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    cache.set("player-1", updated);

    expect(cache.getCurrent("player-1")).toBe(updated);
  });

  it("keeps serving a subscribed player whose filtered delta set was empty", () => {
    const cache = createPlayerSnapshotCache();
    const snapshot = snapshotWith([{ x: 1, y: 1 }]);
    cache.set("player-1", snapshot);

    cache.bumpWorldRevision();
    cache.markCurrent("player-1");

    expect(cache.getCurrent("player-1")).toBe(snapshot);
  });

  it("markCurrent does not create an entry for a player with no cached snapshot", () => {
    const cache = createPlayerSnapshotCache();
    cache.markCurrent("nobody");

    expect(cache.peek("nobody")).toBeUndefined();
  });

  it("re-stamps a stale entry only when it is rebuilt", () => {
    const cache = createPlayerSnapshotCache();
    cache.set("player-1", snapshotWith([{ x: 1, y: 1 }]));
    cache.bumpWorldRevision();
    expect(cache.getCurrent("player-1")).toBeUndefined();

    const rebuilt = snapshotWith([{ x: 1, y: 1 }, { x: 9, y: 9 }]);
    cache.set("player-1", rebuilt);

    expect(cache.getCurrent("player-1")).toBe(rebuilt);
  });

  // An async build exports the world in chunks with yields, so a batch that
  // lands mid-build may not be reflected in what it exported. Stamping it at
  // the current revision would assert a freshness the snapshot doesn't have.
  it("does not treat a build that started before a batch as current", () => {
    const cache = createPlayerSnapshotCache();
    const startedAtRevision = cache.worldRevision();

    cache.bumpWorldRevision(); // batch lands mid-build
    cache.set("player-1", snapshotWith([{ x: 1, y: 1 }]), startedAtRevision);

    expect(cache.getCurrent("player-1")).toBeUndefined();
  });

  it("treats a build with no intervening batch as current", () => {
    const cache = createPlayerSnapshotCache();
    const startedAtRevision = cache.worldRevision();
    const snapshot = snapshotWith([{ x: 1, y: 1 }]);

    cache.set("player-1", snapshot, startedAtRevision);

    expect(cache.getCurrent("player-1")).toBe(snapshot);
  });

  it("drops entries on delete and clear", () => {
    const cache = createPlayerSnapshotCache();
    cache.set("player-1", snapshotWith([{ x: 1, y: 1 }]));
    cache.set("player-2", snapshotWith([{ x: 2, y: 2 }]));

    cache.delete("player-1");
    expect(cache.peek("player-1")).toBeUndefined();
    expect(cache.peek("player-2")).toBeDefined();

    cache.clear();
    expect(cache.peek("player-2")).toBeUndefined();
    expect([...cache.entries()]).toEqual([]);
  });

  it("enumerates entries as [playerId, snapshot] pairs for cache metrics", () => {
    const cache = createPlayerSnapshotCache();
    const first = snapshotWith([{ x: 1, y: 1 }]);
    cache.set("player-1", first);
    cache.bumpWorldRevision();
    const second = snapshotWith([{ x: 2, y: 2 }]);
    cache.set("player-2", second);

    // Stale entries are included — they still occupy memory.
    expect([...cache.entries()]).toEqual([
      ["player-1", first],
      ["player-2", second]
    ]);
  });
});

describe("applyNonTileEventToCache", () => {
  const techEventPayload = JSON.stringify({ techIds: ["SURVEY_CORPS"] });

  it("updates the cached snapshot in place", () => {
    const cache = createPlayerSnapshotCache();
    cache.set("player-1", { playerId: "player-1", tiles: [], player: { techIds: [] } } as unknown as PlayerSubscriptionSnapshot);

    expect(applyNonTileEventToCache(cache, "TECH_UPDATE", "player-1", techEventPayload)).toBe(true);
    expect(cache.peek("player-1")?.player?.techIds).toEqual(["SURVEY_CORPS"]);
  });

  // A non-tile event carries no tile state and can reach a player who is
  // offline. Re-stamping here would mark their stale tiles current and
  // reintroduce the stale-INIT bug through a side door.
  it("does not make a stale entry servable again", () => {
    const cache = createPlayerSnapshotCache();
    cache.set("offline-player", { playerId: "offline-player", tiles: [], player: { techIds: [] } } as unknown as PlayerSubscriptionSnapshot);
    cache.bumpWorldRevision();

    expect(applyNonTileEventToCache(cache, "TECH_UPDATE", "offline-player", techEventPayload)).toBe(true);
    expect(cache.getCurrent("offline-player")).toBeUndefined();
  });

  it("does not resurrect an entry for a player with no cached snapshot", () => {
    const cache = createPlayerSnapshotCache();

    expect(applyNonTileEventToCache(cache, "TECH_UPDATE", "nobody", techEventPayload)).toBe(false);
    expect(cache.peek("nobody")).toBeUndefined();
  });

  it("ignores events with no payload", () => {
    const cache = createPlayerSnapshotCache();
    cache.set("player-1", snapshotWith([]));

    expect(applyNonTileEventToCache(cache, "PLAYER_MESSAGE", "player-1", undefined)).toBe(false);
  });
});
