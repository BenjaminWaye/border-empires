import { describe, expect, it } from "vitest";
import { SELF_VISIBILITY_REASON, VisibilityReasonCounts } from "./visibility-reason-counts.js";

describe("VisibilityReasonCounts", () => {
  it("stores no per-tile Map, whatever mix of tags a tile carries", () => {
    // Regression: every covered tile used to hold its own Map (about 190
    // bytes with its usual two or three tags), the largest land-driven holder
    // in the 2026-11-28 heap snapshots. The tags seen there, in their usual
    // combinations, must store as a refcount or a flat pair array.
    const counts = new VisibilityReasonCounts();
    const combos = [
      [SELF_VISIBILITY_REASON],
      [SELF_VISIBILITY_REASON, "reach:self", "relay-beacon"],
      ["radius:ally:p2", "reach:ally:p2", "relay-beacon"],
      ["relay-beacon"]
    ];
    for (let i = 0; i < 1_000; i += 1) {
      for (const reason of combos[i % combos.length]!) counts.add("p1", `${i},0`, reason);
    }
    const stats = counts.stats();
    expect(stats.tiles).toBe(1_000);
    expect(stats.arrayTiles).toBe(750);
    expect(stats.reasonIds).toBe(5);
    expect(counts.reasonsForTile("p1", "1,0")).toEqual(new Set([SELF_VISIBILITY_REASON, "reach:self", "relay-beacon"]));
    expect(counts.reasonsForTile("p1", "0,0")).toEqual(new Set([SELF_VISIBILITY_REASON]));
  });

  it("demotes a tile back to a bare refcount once only its own territory is left, and forgets empty tiles", () => {
    const counts = new VisibilityReasonCounts();
    counts.add("p1", "1,1", SELF_VISIBILITY_REASON);
    counts.add("p1", "1,1", "radius:ally:p2");
    expect(counts.stats().arrayTiles).toBe(1);
    counts.remove("p1", "1,1", "radius:ally:p2");
    expect(counts.stats()).toMatchObject({ tiles: 1, arrayTiles: 0 });
    counts.remove("p1", "1,1", SELF_VISIBILITY_REASON);
    expect(counts.stats()).toMatchObject({ viewers: 0, tiles: 0 });
  });

  it("matches a plain refcount model under random add/remove sequences", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const tags = [SELF_VISIBILITY_REASON, SELF_VISIBILITY_REASON, "reach:self", "radius:ally:p2", "relay-beacon", "temporary-reveal"];
    const counts = new VisibilityReasonCounts();
    const model = new Map<string, number>();
    for (let step = 0; step < 20_000; step += 1) {
      const viewer = `p${rand(3)}`;
      const tile = `${rand(20)},0`;
      const tag = tags[rand(tags.length)]!;
      const modelKey = `${viewer}|${tile}|${tag}`;
      const held = model.get(modelKey) ?? 0;
      if (rand(2) === 0) {
        counts.remove(viewer, tile, tag); // removing an absent tag is a no-op, as before
        if (held === 1) model.delete(modelKey);
        else if (held > 1) model.set(modelKey, held - 1);
      } else {
        counts.add(viewer, tile, tag);
        model.set(modelKey, held + 1);
      }
      const expected = new Set([...model.keys()].filter((key) => key.startsWith(`${viewer}|${tile}|`)).map((key) => key.split("|")[2]!));
      expect(counts.reasonsForTile(viewer, tile) ?? new Set()).toEqual(expected);
    }
  });
});
