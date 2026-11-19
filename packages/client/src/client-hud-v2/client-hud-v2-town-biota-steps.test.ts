import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { biotaSteps } from "./client-hud-v2-town-biota-steps.js";

const CHARTER = "frontier-concessions";
const site = (x: number, y: number, extra: Partial<Tile> = {}): Tile =>
  ({ x, y, terrain: "LAND", resource: "LUXURY_BIOTA", ...extra }) as Tile;
// Every list ends with the local Vivarium alternative; the cases below check what comes before it.
const steps = (tiles: Tile[], opts: { charter?: boolean; otherTownsSlots?: number; from?: { x: number; y: number } } = {}) => {
  const all = biotaSteps({ me: "me", tiles, techIds: opts.charter ? [CHARTER] : [], techName: "Frontier Export Charter", otherTownsSlots: opts.otherTownsSlots ?? 0, from: opts.from ?? { x: 10, y: 10 } });
  expect(all.at(-1)).toEqual({ kind: "vivarium", researched: false });
  return all.slice(0, -1);
};

// Playtest 2026-11-17: the town screen said "Cultivation Estate supplies 2" without saying
// whether you could build one, or where any biota was.
describe("biota next steps", () => {
  it("asks for the charter and says no biota has been seen", () => {
    expect(steps([])).toEqual([
      { kind: "research", techId: CHARTER, techName: "Frontier Export Charter" },
      { kind: "search" }
    ]);
  });

  it("points at the nearest seen deposit, across the map's wrap on both axes", () => {
    const w = WORLD_WIDTH, h = WORLD_HEIGHT;
    expect(steps([site(40, 10), site(w - 5, 12)], { charter: true })).toEqual([{ kind: "capture", x: w - 5, y: 12 }]);
    expect(steps([site(10, 40), site(12, h - 3)], { charter: true, from: { x: 10, y: 2 } })).toEqual([{ kind: "capture", x: 12, y: h - 3 }]);
  });

  it("prefers your own idle site: garrison it, then build once chartered", () => {
    expect(steps([site(11, 10), site(20, 10, { ownerId: "me", ownershipState: "FRONTIER" })], { charter: true }))
      .toEqual([{ kind: "garrison", x: 20, y: 10 }]);
    expect(steps([site(20, 10, { ownerId: "me", ownershipState: "SETTLED" })], { charter: true }))
      .toEqual([{ kind: "build", x: 20, y: 10 }]);
    expect(steps([site(20, 10, { ownerId: "me", ownershipState: "SETTLED" })]).map((s) => s.kind)).toEqual(["research", "owned"]);
  });

  it("says an Estate is going up or switched off, and how many slots older towns took", () => {
    const estate = (status: "under_construction" | "active" | "inactive" | "removing") =>
      site(20, 10, { ownerId: "me", ownershipState: "SETTLED", economicStructure: { ownerId: "me", type: "CULTIVATION_ESTATE", status } as NonNullable<Tile["economicStructure"]> });
    expect(steps([estate("under_construction")], { charter: true })).toEqual([{ kind: "building", x: 20, y: 10 }]);
    expect(steps([estate("inactive")], { charter: true })).toEqual([{ kind: "inactive", x: 20, y: 10 }]);
    expect(steps([estate("removing")], { charter: true })).toEqual([{ kind: "inactive", x: 20, y: 10 }]);
    expect(steps([estate("active")], { charter: true, otherTownsSlots: 2 })).toEqual([{ kind: "taken", slots: 2 }, { kind: "more" }]);
    // Review of #2840: a Metropolis partly filled by your only Estate was told its slots went to older towns.
    expect(steps([estate("active")], { charter: true, otherTownsSlots: 0 })).toEqual([{ kind: "more" }]);
  });

  it("ends with the Vivarium, flagged by whether Census Office is researched", () => {
    const base = { me: "me", tiles: [], otherTownsSlots: 0, from: { x: 0, y: 0 } };
    expect(biotaSteps({ ...base, techIds: [] }).at(-1)).toEqual({ kind: "vivarium", researched: false });
    expect(biotaSteps({ ...base, techIds: ["census-records"] }).at(-1)).toEqual({ kind: "vivarium", researched: true });
  });
});
