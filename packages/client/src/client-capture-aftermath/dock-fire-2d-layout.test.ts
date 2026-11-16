import { describe, expect, it } from "vitest";
import { HARBOUR_FACINGS } from "../client-harbour-slipways/client-harbour-slipways.js";
import { dockFireLayout2D } from "./dock-fire-2d-layout.js";

describe("2D dock fire layout", () => {
  it("burns on the turned dock sprite, inside the tile, following the quay's facing", () => {
    // Regression: the 2D flames sat at fixed spots painted for the old sprite,
    // so on the new turned sprites they landed on bare plinth or water.
    for (const facing of HARBOUR_FACINGS) {
      for (const [x, y] of dockFireLayout2D(facing).flames) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(1);
      }
    }
    // The carrier burns on the sea side: below the office facing south, above it facing north.
    const office = 0, carrier = 5;
    const south = dockFireLayout2D({ dx: 0, dy: 1 }).flames, north = dockFireLayout2D({ dx: 0, dy: -1 }).flames;
    expect(south[carrier]![1]).toBeGreaterThan(south[office]![1]);
    expect(north[carrier]![1]).toBeLessThan(north[office]![1]);
  });
});
