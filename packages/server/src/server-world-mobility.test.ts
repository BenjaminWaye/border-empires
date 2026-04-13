import { describe, expect, it } from "vitest";

import { hasBarbarianMaintenanceFogBuffer } from "./server-world-mobility.js";

describe("hasBarbarianMaintenanceFogBuffer", () => {
  it("rejects tiny unexplored pockets that would stack spawns onto a small island", () => {
    const darkTiles = new Set(["0,0", "1,0", "2,0", "0,1", "1,1", "2,1", "0,2", "1,2", "2,2"]);

    expect(
      hasBarbarianMaintenanceFogBuffer({
        x: 1,
        y: 1,
        tileAt: () => ({ terrain: "LAND" }),
        isOutOfSight: (x, y) => darkTiles.has(`${x},${y}`)
      })
    ).toBe(false);
  });

  it("allows maintenance spawns when the surrounding fog mass is still large", () => {
    expect(
      hasBarbarianMaintenanceFogBuffer({
        x: 10,
        y: 10,
        tileAt: () => ({ terrain: "LAND" }),
        isOutOfSight: () => true
      })
    ).toBe(true);
  });
});
