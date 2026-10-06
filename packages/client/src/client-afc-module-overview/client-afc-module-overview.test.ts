import { describe, expect, it } from "vitest";
import { afcModuleOverviewLines } from "./client-afc-module-overview.js";
import type { Tile } from "../client-types.js";

const baseTile = (afc?: Tile["afc"]): Tile => ({ x: 0, y: 0, terrain: "LAND", ...(afc ? { afc } : {}) }) as Tile;

describe("afcModuleOverviewLines", () => {
  it("is empty for a tile without an AFC", () => {
    expect(afcModuleOverviewLines(baseTile())).toEqual([]);
  });

  it("summarises bay use, counting incoming modules, and points at the Modules tab", () => {
    const lines = afcModuleOverviewLines(
      baseTile({ ownerId: "p1", status: "active", modules: ["masonry", "workshops"], incomingModules: [{ techId: "radar", arrivesAt: 1 }] })
    );
    expect(lines.map((l) => l.html)).toEqual(["AFC Modules", "3/8 bays in use · 1 incoming — see the Modules tab."]);
  });

  it("warns when the AFC is dormant", () => {
    const lines = afcModuleOverviewLines(baseTile({ ownerId: "p1", status: "inactive" }));
    expect(lines[1]?.html).toContain("Dormant");
  });
});
