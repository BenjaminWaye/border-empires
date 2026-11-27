import { describe, expect, it } from "vitest";
import { SELF_VISIBILITY_REASON, addReasonCount, reasonCountStats, reasonKeysForTile, removeReasonCount, type VisibilityReasonCounts } from "./visibility-reason-counts.js";

describe("visibility reason counts", () => {
  it("keeps a tile covered only by the viewer's own territory without a per-tile Map", () => {
    // Regression: every covered tile used to hold its own one-entry Map
    // (about 185 bytes), the largest growing holder in the 2026-11-28 heap
    // snapshots. Own-territory coverage is nearly all of it.
    const reasons: VisibilityReasonCounts = new Map();
    for (let i = 0; i < 1_000; i += 1) {
      addReasonCount(reasons, "p1", `${i},0`, SELF_VISIBILITY_REASON);
      addReasonCount(reasons, "p1", `${i},0`, SELF_VISIBILITY_REASON);
    }
    expect(reasonCountStats(reasons)).toEqual({ tiles: 1_000, mapTiles: 0 });
    expect(reasonKeysForTile(reasons, "p1", "5,0")).toEqual(new Set([SELF_VISIBILITY_REASON]));
  });

  it("promotes a tile with a second reason and demotes it once only its own territory is left", () => {
    const reasons: VisibilityReasonCounts = new Map();
    addReasonCount(reasons, "p1", "1,1", SELF_VISIBILITY_REASON);
    addReasonCount(reasons, "p1", "1,1", "radius:ally:p2");
    expect(reasonKeysForTile(reasons, "p1", "1,1")).toEqual(new Set([SELF_VISIBILITY_REASON, "radius:ally:p2"]));
    expect(reasonCountStats(reasons).mapTiles).toBe(1);
    removeReasonCount(reasons, "p1", "1,1", "radius:ally:p2");
    expect(reasonCountStats(reasons)).toEqual({ tiles: 1, mapTiles: 0 });
    removeReasonCount(reasons, "p1", "1,1", SELF_VISIBILITY_REASON);
    expect(reasons.size).toBe(0);
  });

  it("matches a plain refcount model under random add/remove sequences", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const tags = [SELF_VISIBILITY_REASON, SELF_VISIBILITY_REASON, "radius:ally:p2", "relay-beacon", "temporary-reveal"];
    const reasons: VisibilityReasonCounts = new Map();
    const model = new Map<string, number>();
    for (let step = 0; step < 20_000; step += 1) {
      const viewer = `p${rand(3)}`;
      const tile = `${rand(20)},0`;
      const tag = tags[rand(tags.length)]!;
      const modelKey = `${viewer}|${tile}|${tag}`;
      const held = model.get(modelKey) ?? 0;
      if (held > 0 && rand(2) === 0) {
        removeReasonCount(reasons, viewer, tile, tag);
        if (held === 1) model.delete(modelKey);
        else model.set(modelKey, held - 1);
      } else {
        addReasonCount(reasons, viewer, tile, tag);
        model.set(modelKey, held + 1);
      }
      const expected = new Set([...model.keys()].filter((key) => key.startsWith(`${viewer}|${tile}|`)).map((key) => key.split("|")[2]!));
      expect(reasonKeysForTile(reasons, viewer, tile) ?? new Set()).toEqual(expected);
    }
  });
});
