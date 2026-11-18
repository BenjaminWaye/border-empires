import { describe, expect, it } from "vitest";
import { HOUSE_CHARGE_SEARCH_RADIUS, type HouseChargeView } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { houseChargeSearchGuide, roughCircleFor } from "./client-house-charges-search-guide.js";

const W = 640;
const H = 320;
const vell = { key: "town:8,15", name: "Vell", x: 8, y: 15 };
const harrowmere = { key: "town:38,24", name: "Harrowmere", x: 38, y: 24 };
const road: HouseChargeView = {
  id: "CHARTER:abc",
  kind: "CHARTER",
  title: "Road",
  rarity: "COMMON",
  renown: 1,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 23, y: 19, radius: 19 },
  targets: [vell, harrowmere]
};
const stateFor = (charge: HouseChargeView, seen: string[] = []) => ({
  houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 0, choiceClosesAt: 0, charges: [charge] },
  houseChargeFocusId: charge.id,
  tiles: new Map<string, Tile>(seen.map((key) => {
    const [x, y] = key.split(",").map(Number) as [number, number];
    return [key, { x, y, terrain: "LAND" }];
  }))
});
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("Show on map for a Charter with neither town scouted", () => {
  it("draws one rough circle per town, each holding its town off-centre, not one ring of separate markers", () => {
    const guide = houseChargeSearchGuide(stateFor(road), W, H);
    expect(guide.circles).toHaveLength(2);
    for (const [circle, town] of [[guide.circles[0]!, vell], [guide.circles[1]!, harrowmere]] as const) {
      expect(circle.radius).toBe(HOUSE_CHARGE_SEARCH_RADIUS);
      const offset = distance(circle, town);
      expect(offset).toBeGreaterThan(HOUSE_CHARGE_SEARCH_RADIUS * 0.25);
      expect(offset).toBeLessThan(HOUSE_CHARGE_SEARCH_RADIUS * 0.7);
    }
    // Every ring dot sits on one of the two circles.
    for (const dot of guide.ringDots) {
      expect(guide.circles.some((circle) => Math.abs(distance(dot, circle) - circle.radius) < 1e-6)).toBe(true);
    }
  });

  it("joins the two circles with a dotted line that runs between their edges", () => {
    const guide = houseChargeSearchGuide(stateFor(road), W, H);
    const [a, b] = guide.circles as [typeof guide.circles[0], typeof guide.circles[0]];
    expect(guide.linkDots.length).toBeGreaterThan(3);
    for (const dot of guide.linkDots) {
      expect(distance(dot, a)).toBeGreaterThanOrEqual(a.radius - 1e-6);
      expect(distance(dot, b)).toBeGreaterThanOrEqual(b.radius - 1e-6);
    }
    expect(distance(guide.linkDots[0]!, a)).toBeCloseTo(a.radius, 6);
    expect(distance(guide.linkDots.at(-1)!, b)).toBeCloseTo(b.radius, 6);
  });

  it("keeps each circle in place across calls, and links a scouted town itself instead of its circle", () => {
    expect(roughCircleFor(road.id, vell, W, H)).toEqual(roughCircleFor(road.id, vell, W, H));
    const guide = houseChargeSearchGuide(stateFor(road, ["8,15"]), W, H);
    expect(guide.circles).toEqual([roughCircleFor(road.id, harrowmere, W, H)]);
    expect(distance(guide.linkDots[0]!, vell)).toBeCloseTo(1, 6);
  });

  it("takes the short way round the wrapped world", () => {
    const east = { key: "town:636,15", name: "East", x: 636, y: 15 };
    const west = { key: "town:30,15", name: "West", x: 30, y: 15 };
    const guide = houseChargeSearchGuide(stateFor({ ...road, targets: [east, west] }), W, H);
    // The short way crosses x = 0: no dot lands in the middle of the map.
    expect(guide.linkDots.length).toBeGreaterThan(0);
    expect(guide.linkDots.every((dot) => dot.x < 60 || dot.x > 580)).toBe(true);
  });

  it("does not link a single-town charge, and draws nothing without a focus", () => {
    const seat: HouseChargeView = { ...road, id: "SEAT:x", kind: "SEAT", targets: [vell] };
    const guide = houseChargeSearchGuide(stateFor(seat), W, H);
    expect(guide.circles).toHaveLength(1);
    expect(guide.linkDots).toEqual([]);
    expect(houseChargeSearchGuide({ ...stateFor(road), houseChargeFocusId: undefined }, W, H)).toEqual({ circles: [], ringDots: [], linkDots: [] });
  });
});

describe("Show on map for charges without an exact point", () => {
  it("draws the server's search circle for a Correction or Three Seats charge, scouted or not, and never a link", () => {
    for (const kind of ["CORRECTION", "METROPOLIS"] as const) {
      const charge: HouseChargeView = { ...road, id: `${kind}:x`, kind, searchCircle: { x: 40, y: 30, radius: 9 }, targets: [{ key: "house:p2", name: "Varn", x: 40, y: 30 }] };
      for (const seen of [[], ["40,30"]]) {
        const guide = houseChargeSearchGuide(stateFor(charge, seen), W, H);
        expect(guide.circles).toEqual([charge.searchCircle]);
        expect(guide.linkDots).toEqual([]);
      }
    }
  });
});
