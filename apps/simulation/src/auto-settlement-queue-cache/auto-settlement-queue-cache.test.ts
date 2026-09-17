import { describe, expect, it } from "vitest";
import { AutoSettlementQueueCache } from "./auto-settlement-queue-cache.js";

// Regression for the 2026-09-17 prod CPU-throttle incident: a HUMAN player
// with ~10.5k frontier tiles had the O(frontier) auto-settlement queue
// rebuilt on every state update. The cache now covers every player and only
// rebuilds when the player is dirty (and not within the coalesce window) or
// the entry has aged out.

const makeCache = () => {
  let nowMs = 1_000_000;
  const cache = new AutoSettlementQueueCache(() => nowMs, 5_000, 60_000);
  return { cache, advance: (ms: number) => { nowMs += ms; } };
};

describe("AutoSettlementQueueCache", () => {
  it("rebuilds once and then serves hits until marked dirty", () => {
    const { cache } = makeCache();
    let rebuilds = 0;
    const rebuild = () => { rebuilds += 1; return [{ x: 1, y: 2 }]; };
    const notBlocked = () => false;
    expect(cache.read("p", rebuild, notBlocked)).toEqual([{ x: 1, y: 2 }]);
    cache.read("p", rebuild, notBlocked);
    cache.read("p", rebuild, notBlocked);
    expect(rebuilds).toBe(1);
    expect(cache.stats.hits).toBe(2);
  });

  it("coalesces dirty rebuilds inside the coalesce window, then rebuilds after it", () => {
    const { cache, advance } = makeCache();
    let rebuilds = 0;
    const rebuild = () => { rebuilds += 1; return []; };
    cache.read("p", rebuild, () => false);
    cache.markDirty("p");
    advance(1_000);
    cache.read("p", rebuild, () => false); // dirty but only 1s old -> still served
    expect(rebuilds).toBe(1);
    expect(cache.isDirty("p")).toBe(true);
    advance(5_000);
    cache.read("p", rebuild, () => false); // dirty and past the window -> rebuild
    expect(rebuilds).toBe(2);
    expect(cache.isDirty("p")).toBe(false);
  });

  it("rebuilds a clean entry once it exceeds the max age (bounds staleness for non-dirtying inputs)", () => {
    const { cache, advance } = makeCache();
    let rebuilds = 0;
    const rebuild = () => { rebuilds += 1; return []; };
    cache.read("p", rebuild, () => false);
    advance(59_000);
    cache.read("p", rebuild, () => false);
    expect(rebuilds).toBe(1);
    advance(2_000);
    cache.read("p", rebuild, () => false);
    expect(rebuilds).toBe(2);
  });

  it("re-filters a cached queue through the transient isBlocked check", () => {
    const { cache } = makeCache();
    const rebuild = () => [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    cache.read("p", rebuild, () => false);
    const blocked = new Set(["1,1"]);
    expect(cache.read("p", rebuild, (k) => blocked.has(k))).toEqual([{ x: 2, y: 2 }]);
  });

  it("keeps players independent and supports forget()", () => {
    const { cache } = makeCache();
    let rebuildsA = 0;
    let rebuildsB = 0;
    cache.read("a", () => { rebuildsA += 1; return []; }, () => false);
    cache.read("b", () => { rebuildsB += 1; return []; }, () => false);
    cache.markDirty("a");
    cache.forget("a");
    cache.read("a", () => { rebuildsA += 1; return []; }, () => false);
    cache.read("b", () => { rebuildsB += 1; return []; }, () => false);
    expect(rebuildsA).toBe(2);
    expect(rebuildsB).toBe(1);
  });
});
