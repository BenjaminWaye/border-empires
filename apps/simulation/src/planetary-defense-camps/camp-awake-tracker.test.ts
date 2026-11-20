import { describe, expect, it } from "vitest";
import { PlanetaryDefenseCampAwakeTracker } from "./camp-awake-tracker.js";
import { PlanetaryDefenseCampIndex } from "./camp-index.js";

// A tiny harness: a camp index fed tile writes, a hand-held visibility table,
// and a tracker wired the way camp-runtime.ts wires it.
const harness = (watchers: string[]) => {
  const visible = new Map<string, Set<string>>();
  const online = new Set(watchers);
  const index = new PlanetaryDefenseCampIndex();
  const tracker = new PlanetaryDefenseCampAwakeTracker({
    candidateWatcherIds: () => ["p1", "p2"],
    isWatcherNow: (id) => online.has(id),
    isVisible: (viewer, key) => visible.get(viewer)?.has(key) ?? false,
    campOf: (key) => index.campOf(key),
    memberTileKeys: () => index.memberTileKeys()
  });
  index.setListener({ onTileJoined: (k, c) => tracker.onTileJoined(k, c), onTileLeft: (k, c) => tracker.onTileLeft(k, c) });
  const see = (viewer: string, key: string, on: boolean): void => {
    const set = visible.get(viewer) ?? new Set<string>();
    visible.set(viewer, set);
    if (on === set.has(key)) return;
    if (on) set.add(key);
    else set.delete(key);
    tracker.onCoverageEdge(viewer, key, on);
  };
  const write = (key: string, tile: { ownerId?: string; ownershipState?: "SETTLED" | "FRONTIER"; campId?: string } | undefined) => index.onTileWrite(key, tile);
  tracker.syncWatchers();
  return { tracker, see, write, online };
};

describe("PlanetaryDefenseCampAwakeTracker", () => {
  it("counts watcher/tile pairs per camp from edges and membership changes", () => {
    const { tracker, see, write } = harness(["p1"]);
    write("1,1", { ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "1,1" });
    write("2,1", { ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "1,1" });
    expect(tracker.awakeCampIds()).toEqual([]);
    see("p1", "2,1", true);
    expect(tracker.awakeCampIds()).toEqual(["1,1"]);
    see("p1", "2,1", false);
    expect(tracker.awakeCampIds()).toEqual([]);
    see("p1", "3,1", true);
    write("3,1", { ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "1,1" }); // the camp spreads into view
    expect(tracker.awakeCampIds()).toEqual(["1,1"]);
    write("3,1", { ownerId: "p1", ownershipState: "FRONTIER" }); // and loses it again
    expect(tracker.awakeCampIds()).toEqual([]);
    expect(tracker.verify()).toBe(0);
  });

  it("ignores players who aren't watching, and picks up a login or logout", () => {
    const { tracker, see, write, online } = harness([]);
    write("1,1", { ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "1,1" });
    see("p2", "1,1", true);
    expect(tracker.awakeCampIds()).toEqual([]);
    online.add("p2");
    tracker.syncWatchers();
    expect(tracker.awakeCampIds()).toEqual(["1,1"]);
    online.delete("p2");
    tracker.syncWatchers();
    expect(tracker.awakeCampIds()).toEqual([]);
    expect(tracker.verify()).toBe(0);
  });

  it("verify repairs a missed edge and counts the drift", () => {
    const { tracker, write } = harness(["p1"]);
    write("1,1", { ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "1,1" });
    tracker.onCoverageEdge("p1", "1,1", true); // an edge with no matching coverage: drift
    expect(tracker.awakeCampIds()).toEqual(["1,1"]);
    expect(tracker.verify()).toBe(1);
    expect(tracker.awakeCampIds()).toEqual([]);
    expect(tracker.sizes().driftTotal).toBe(1);
  });
});
