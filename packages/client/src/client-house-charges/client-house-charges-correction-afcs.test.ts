import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { houseChargeMarkerTiles } from "./client-house-charges-map.js";
import { houseChargeSearchGuide } from "./client-house-charges-search-guide.js";

// Owner report 2026-11-23: holding House Gerald's AFC, "Show on map" on the
// Writ of Correction still drew the dotted search circle over it.
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
  tiles: new Map<string, Tile>(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]))
});

const land = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra });

describe("Writ of Correction map guide", () => {
  it("keeps the search circle while the rival's AFC is unfound", () => {
    const state = stateFor(writ, [land(40, 30), land(36, 33, { afc: { ownerId: "p3", status: "active" } })]);
    expect(houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT).circles).toEqual([writ.searchCircle]);
    expect(houseChargeMarkerTiles(state)).toEqual([]);
  });

  it("drops the circle and rings the AFC once the rival's AFC is on explored ground", () => {
    const state = stateFor(writ, [land(43, 27, { ownerId: "p2", afc: { ownerId: "p2", status: "active" } })]);
    expect(houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT).circles).toEqual([]);
    expect(houseChargeMarkerTiles(state)).toEqual([{ x: 43, y: 27 }]);
  });

  it("drops the circle once the Writ is held, and rings the captured AFC (its founder survives the capture)", () => {
    const captured = land(43, 27, { ownerId: "p1", afc: { ownerId: "p1", status: "active", capturedAt: 50, foundedBy: "p2" } });
    const state = stateFor({ ...writ, held: true, size: 1 }, [captured]);
    expect(houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT)).toEqual({ circles: [], ringDots: [], linkDots: [] });
    expect(houseChargeMarkerTiles(state)).toEqual([{ x: 43, y: 27 }]);
    // Held with the captured AFC outside the circle: still no circle.
    expect(houseChargeSearchGuide(stateFor({ ...writ, held: true, size: 1 }, []), WORLD_WIDTH, WORLD_HEIGHT).circles).toEqual([]);
  });
});
