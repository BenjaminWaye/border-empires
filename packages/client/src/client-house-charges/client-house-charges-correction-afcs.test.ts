import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { correctionGarrisonHint } from "./client-house-charges-correction-afcs.js";
import { houseChargeFitDiscs } from "./client-house-charges-fit.js";
import { houseChargeMarkerTiles } from "./client-house-charges-map.js";
import { houseChargeSearchGuide } from "./client-house-charges-search-guide.js";
import { mapGuideRingTiles } from "./client-map-guide-ring-tiles.js";

// Owner report 2026-11-23: holding House Gerald's AFC, "Show on map" on the
// Writ of Correction still drew the dotted search circle, and the AFC itself
// was not marked.
const writ: HouseChargeView = {
  id: "CORRECTION:x",
  kind: "CORRECTION",
  title: "The Correction of House Gerald",
  rarity: "COMMON",
  renown: 2,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 40, y: 30, radius: 9 },
  targets: [{ key: "house:p2", name: "Gerald", x: 40, y: 30 }]
};

const stateFor = (charge: HouseChargeView, tiles: Tile[]) => ({
  houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 0, choiceClosesAt: 0, charges: [charge] },
  houseChargeFocusId: charge.id,
  me: "p1",
  onboardingHighlightTiles: [],
  tiles: new Map<string, Tile>(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]))
});

const land = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra });
/** p2's landing AFC, captured by p1: far outside the search circle. */
const captured = (ownershipState: "SETTLED" | "FRONTIER"): Tile =>
  land(120, 90, { ownerId: "p1", ownershipState, afc: { ownerId: "p1", status: "active", capturedAt: 50, foundedBy: "p2" } });

describe("Writ of Correction map guide", () => {
  it("keeps the search circle while no AFC the rival founded is in view", () => {
    const state = stateFor(writ, [land(40, 30), land(36, 33, { ownerId: "p3", afc: { ownerId: "p3", status: "active" } })]);
    expect(houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT).circles).toEqual([writ.searchCircle]);
    expect(houseChargeMarkerTiles(state)).toEqual([]);
  });

  it("swaps the circle for the onboarding ring on the rival's AFC once it is on explored ground", () => {
    const state = stateFor(writ, [land(43, 27, { ownerId: "p2", afc: { ownerId: "p2", status: "active" } })]);
    expect(houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT).circles).toEqual([]);
    expect(mapGuideRingTiles(state, 0)).toEqual([{ x: 43, y: 27 }]);
  });

  it("rings a captured AFC anywhere, held or still unsettled, and Show on map frames it", () => {
    for (const [held, ownershipState] of [[true, "SETTLED"], [false, "FRONTIER"]] as const) {
      const charge = { ...writ, held, size: held ? 1 : 0 };
      const state = stateFor(charge, [captured(ownershipState)]);
      expect(houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT)).toEqual({ circles: [], ringDots: [], linkDots: [] });
      expect(mapGuideRingTiles(state, 0)).toEqual([{ x: 120, y: 90 }]);
      expect(houseChargeFitDiscs(charge, () => true, houseChargeMarkerTiles(state))).toEqual([{ x: 120, y: 90, radius: 2 }]);
    }
  });

  it("asks for a garrison only while the captured AFC is unsettled", () => {
    expect(correctionGarrisonHint(writ, stateFor(writ, [captured("FRONTIER")]), "House Gerald")).toBe("House Gerald's AFC taken: garrison it to hold the Writ");
    expect(correctionGarrisonHint(writ, stateFor(writ, [captured("SETTLED")]), "House Gerald")).toBeUndefined();
    expect(correctionGarrisonHint({ ...writ, held: true }, stateFor(writ, [captured("SETTLED")]), "House Gerald")).toBeUndefined();
  });
});
