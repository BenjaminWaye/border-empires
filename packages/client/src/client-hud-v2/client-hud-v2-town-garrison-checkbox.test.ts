import { describe, expect, it } from "vitest";
import { townScreenRegions } from "./client-hud-v2-town.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

const town = { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "T", type: "FARMING", populationTier: "TOWN" } } as Tile;
const support = { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
const view = (actions: TileActionDef[]): TileMenuView =>
  ({ title: "T", subtitle: "", actions, buildings: [], crystal: [], tabs: ["actions"], overviewLines: [] }) as unknown as TileMenuView;

describe("town screen Garrison auto checkbox", () => {
  it("shows the auto-garrison checkbox with the support tile's Garrison button", () => {
    const garrison = {
      id: "settle_land", label: "Garrison", cost: "0 coin, 20 manpower",
      autoSettleOption: { category: "towns", checked: true, label: "Garrison towns automatically" }
    } as TileActionDef;
    const { bar } = townScreenRegions({
      town, focus: support, townView: view([]), focusView: view([garrison]),
      townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined
    });
    expect(bar).toContain('data-tile-auto-settle="towns"');
    expect(bar).toContain("checked");
  });
});
