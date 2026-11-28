import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { empireIntegrity } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { integrityDropNotice, type IntegritySnapshot } from "./client-integrity-drop-cause.js";
import { createIntegrityDropTracker, INTEGRITY_DROP_BATCH_MS, INTEGRITY_DROP_COOLDOWN_MS, observeIntegrity } from "./client-integrity-drop-tracker.js";
import { isIntegrityHoleAt, scanIntegrityShape } from "./client-integrity-shape.js";
import { integrityDropFeedEntry, observeIntegrityDropFromUpdate, resetIntegrityDropTracking } from "./client-integrity-drop-notice.js";
import { integrityDropCardHtml } from "./client-integrity-drop-card.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const land = (): Tile["terrain"] => "LAND";

const owned = (coords: ReadonlyArray<[number, number]>, state: Tile["ownershipState"] = "SETTLED"): Map<string, Tile> =>
  new Map(coords.map(([x, y]) => [keyFor(x, y), { x, y, terrain: "LAND", ownerId: "me", ownershipState: state } as Tile]));

const square = (size: number, skip: ReadonlyArray<[number, number]> = []): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!skip.some(([sx, sy]) => sx === x && sy === y)) out.push([x, y]);
  return out;
};

const args = (tiles: Map<string, Tile>, terrainAt: (x: number, y: number) => Tile["terrain"] = land) =>
  ({ tiles, me: "me", keyFor, wrapX: (x: number) => x, wrapY: (y: number) => y, terrainAt });

const snap = (pct: number, owned: number, garrisoned: number, openSides: number): IntegritySnapshot => ({ pct, owned, garrisoned, openSides });

describe("integrity shape", () => {
  it("finds a hole walled in by your land", () => {
    const tiles = owned(square(5, [[2, 2]]));
    expect(isIntegrityHoleAt(2, 2, args(tiles))).toBe(true);
    expect(isIntegrityHoleAt(9, 9, args(tiles))).toBe(false);
    expect(scanIntegrityShape(args(tiles)).holes.map((h) => h.key)).toEqual(["2,2"]);
  });

  it("never calls water or mountain a hole", () => {
    const tiles = owned(square(5, [[2, 2]]));
    expect(isIntegrityHoleAt(2, 2, args(tiles, (x, y) => (x === 2 && y === 2 ? "SEA" : "LAND")))).toBe(false);
  });

  it("finds a thin line and says which coast it runs along", () => {
    const tiles = owned([...square(4), [4, 1], [5, 1], [6, 1]]);
    const scan = scanIntegrityShape(args(tiles, (x) => (x === 7 ? "SEA" : "LAND")));
    expect(scan.thinLines.map((t) => t.key)).toEqual(["4,1", "5,1", "6,1"]);
    expect(scan.thinLines.map((t) => t.coastal)).toEqual([false, false, true]);
  });
});

describe("integrity drop cause", () => {
  const empty = { holes: [], thinLines: [], centre: { x: 0, y: 0 } };

  it("blames ungarrisoned new land when the garrison penalty grew", () => {
    // 40 tiles, 4 garrisoned (10%) -> 60 tiles, 4 garrisoned: the penalty starts.
    const notice = integrityDropNotice(snap(100, 40, 4, 26), snap(89, 60, 4, 32), empty, undefined, 1);
    expect(notice).toMatchObject({ kind: "garrison", cause: "20 new tiles not garrisoned", fix: "Garrison 2 tiles", fromPct: 100, toPct: 89 });
  });

  it("names a new hole before an old one", () => {
    const scan = { holes: [{ x: 1, y: 1, key: "1,1", coastal: false }, { x: 7, y: 3, key: "7,3", coastal: false }], thinLines: [], centre: { x: 4, y: 4 } };
    const notice = integrityDropNotice(snap(100, 60, 30, 30), snap(90, 60, 30, 38), scan, new Set(["1,1"]), 1);
    expect(notice).toMatchObject({ kind: "hole", cause: "Hole at (7, 3)", fix: "Take the hole", focus: { x: 7, y: 3 } });
  });

  it("describes a thin line by compass and coast", () => {
    const scan = { holes: [], thinLines: [{ x: 20, y: 5, key: "20,5", coastal: true }], centre: { x: 5, y: 5 } };
    expect(integrityDropNotice(snap(100, 60, 30, 30), snap(90, 63, 30, 38), scan, undefined, 1).cause).toBe("Thin line along the east coast");
  });

  it("falls back to the open sides added", () => {
    expect(integrityDropNotice(snap(100, 60, 30, 30), snap(90, 62, 30, 36), empty, undefined, 1).cause).toBe("+6 open sides");
  });
});

describe("integrity drop throttle", () => {
  it("ignores small drops, batches a run of drops, and keeps a cooldown", () => {
    const tracker = createIntegrityDropTracker();
    expect(observeIntegrity(tracker, snap(100, 1, 1, 1), 0).kind).toBe("none");
    expect(observeIntegrity(tracker, snap(98, 1, 1, 1), 1_000).kind).toBe("none");
    expect(observeIntegrity(tracker, snap(95, 1, 1, 1), 2_000)).toEqual({ kind: "wait", ms: INTEGRITY_DROP_BATCH_MS });
    expect(observeIntegrity(tracker, snap(89, 1, 1, 1), 4_000).kind).toBe("wait");
    const shown = observeIntegrity(tracker, snap(89, 1, 1, 1), 2_000 + INTEGRITY_DROP_BATCH_MS);
    expect(shown).toMatchObject({ kind: "notice", before: { pct: 100 }, after: { pct: 89 } });
    // Another drop right away waits out the cooldown.
    const again = observeIntegrity(tracker, snap(80, 1, 1, 1), 10_000);
    expect(again.kind).toBe("wait");
    expect(observeIntegrity(tracker, snap(80, 1, 1, 1), 2_000 + INTEGRITY_DROP_BATCH_MS + INTEGRITY_DROP_COOLDOWN_MS).kind).toBe("notice");
  });

  it("drops a pending notice when integrity recovers", () => {
    const tracker = createIntegrityDropTracker();
    observeIntegrity(tracker, snap(100, 1, 1, 1), 0);
    expect(observeIntegrity(tracker, snap(90, 1, 1, 1), 1).kind).toBe("wait");
    expect(observeIntegrity(tracker, snap(100, 1, 1, 1), 2).kind).toBe("none");
    expect(observeIntegrity(tracker, snap(100, 1, 1, 1), 60_000).kind).toBe("none");
  });
});

describe("integrity drop notice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetIntegrityDropTracking();
  });
  afterEach(() => {
    resetIntegrityDropTracking();
    vi.useRealTimers();
  });

  // Owner request 2026-11-27: players saw 100% -> 89% with no explanation.
  it("explains a drop on the alert card with a Fix that opens the Integrity panel", () => {
    const tiles = owned(square(5));
    const pct = (t: number, e: number, s: number) => empireIntegrity(t, e, s) * 100;
    const state = { me: "me", tiles, defensibilityPct: pct(25, 20, 25), ownedT: 25, settledT: 25, settledE: 20, integrityDropNotice: undefined as ReturnType<typeof integrityDropNotice> | undefined };
    const pushFeedEntry = vi.fn();
    const deps = { keyFor, terrainAt: land, pushFeedEntry, renderHud: vi.fn() };
    observeIntegrityDropFromUpdate(state, { integrityPct: state.defensibilityPct }, deps);
    // Punch a hole in the middle: 4 more open sides, the same land count.
    tiles.delete("2,2");
    Object.assign(state, { ownedT: 24, settledT: 24, settledE: 24, defensibilityPct: pct(24, 24, 24) - 5 });
    observeIntegrityDropFromUpdate(state, { integrityPct: state.defensibilityPct }, deps);
    expect(pushFeedEntry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INTEGRITY_DROP_BATCH_MS);
    expect(pushFeedEntry).toHaveBeenCalledTimes(1);
    expect(state.integrityDropNotice).toMatchObject({ kind: "hole", cause: "1 tile lost · Hole at (2, 2)", focus: { x: 2, y: 2 } });
    expect(pushFeedEntry.mock.calls[0]?.[0]).toMatchObject({ severity: "warn", openPanel: "integrity", actionLabel: "Fix", text: "1 tile lost · Hole at (2, 2) · Take the hole" });
  });

  it("ignores partial updates without the server's integrityPct", () => {
    const state = { me: "me", tiles: owned(square(3)), defensibilityPct: 50, ownedT: 9, settledT: 9, settledE: 12, integrityDropNotice: undefined };
    const pushFeedEntry = vi.fn();
    observeIntegrityDropFromUpdate(state, {}, { keyFor, terrainAt: land, pushFeedEntry, renderHud: vi.fn() });
    vi.advanceTimersByTime(INTEGRITY_DROP_COOLDOWN_MS);
    expect(pushFeedEntry).not.toHaveBeenCalled();
  });

  it("renders the panel card with what, cause, fix and Garrison Many for a garrison shortfall", () => {
    const notice = integrityDropNotice(snap(100, 40, 4, 26), snap(89, 60, 4, 32), { holes: [], thinLines: [], centre: undefined }, undefined, 5);
    const html = integrityDropCardHtml(notice);
    expect(html).toContain("Why it fell · 100% → 89%");
    expect(html).toContain("how compact and garrisoned your land is");
    expect(html).toContain("data-integrity-garrison-many");
    expect(integrityDropFeedEntry(notice).title).toBe("Integrity 100% → 89%");
    expect(integrityDropCardHtml(undefined)).toBe("");
  });
});
