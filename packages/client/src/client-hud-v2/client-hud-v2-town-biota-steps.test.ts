import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { biotaSteps } from "./client-hud-v2-town-biota-steps.js";

const CHARTER = "frontier-concessions";
const site = (x: number, y: number, extra: Partial<Tile> = {}): Tile =>
  ({ x, y, terrain: "LAND", resource: "LUXURY_BIOTA", ...extra }) as Tile;
const steps = (tiles: Tile[], opts: { charter?: boolean; supplySites?: number } = {}) =>
  biotaSteps({ me: "me", tiles, techIds: opts.charter ? [CHARTER] : [], techName: "Frontier Export Charter", supplySites: opts.supplySites ?? 0, from: { x: 10, y: 10 }, worldWidth: 100 });

// Playtest 2026-11-17: the town screen said "Cultivation Estate supplies 2" without saying
// whether you could build one, or where any biota was.
describe("biota next steps", () => {
  it("asks for the charter and says no biota has been seen", () => {
    expect(steps([])).toEqual([
      { kind: "research", techId: CHARTER, techName: "Frontier Export Charter" },
      { kind: "search" }
    ]);
  });

  it("points at the nearest seen deposit, across the map's wrap", () => {
    expect(steps([site(40, 10), site(95, 12)], { charter: true })).toEqual([{ kind: "capture", x: 95, y: 12 }]);
  });

  it("prefers your own idle site: garrison it, then build once chartered", () => {
    expect(steps([site(11, 10), site(20, 10, { ownerId: "me", ownershipState: "FRONTIER" })], { charter: true }))
      .toEqual([{ kind: "garrison", x: 20, y: 10 }]);
    expect(steps([site(20, 10, { ownerId: "me", ownershipState: "SETTLED" })], { charter: true }))
      .toEqual([{ kind: "build", x: 20, y: 10 }]);
    expect(steps([site(20, 10, { ownerId: "me", ownershipState: "SETTLED" })]).map((s) => s.kind)).toEqual(["research", "owned"]);
  });

  it("says an Estate is going up, and when your slots already go to older towns", () => {
    const estate = (status: "under_construction" | "active") =>
      site(20, 10, { ownerId: "me", ownershipState: "SETTLED", economicStructure: { ownerId: "me", type: "CULTIVATION_ESTATE", status } as NonNullable<Tile["economicStructure"]> });
    expect(steps([estate("under_construction")], { charter: true })).toEqual([{ kind: "building", x: 20, y: 10 }]);
    expect(steps([estate("active")], { charter: true, supplySites: 1 })).toEqual([{ kind: "taken", slots: 2 }, { kind: "more" }]);
  });
});
