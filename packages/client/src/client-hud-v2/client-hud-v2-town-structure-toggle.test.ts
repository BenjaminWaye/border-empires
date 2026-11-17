import { describe, expect, it } from "vitest";
import { townScreenRegions } from "./client-hud-v2-town.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

// Regression: the town screen's bar dropped the selected building's Disable/Enable switch, so a player short
// on FOOD had no way to switch off a FOOD-slot building from the town screen.
const town = { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "T", type: "FARMING", populationTier: "TOWN" } } as Tile;
const support = { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
const view = (actions: TileActionDef[]): TileMenuView =>
  ({ title: "T", subtitle: "", actions, buildings: [], crystal: [], tabs: ["actions"], overviewLines: [] }) as unknown as TileMenuView;
const bar = (focusActions: TileActionDef[]): string =>
  townScreenRegions({
    town, focus: support, townView: view([]), focusView: view(focusActions),
    townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined
  }).bar;

describe("town screen structure on/off switch", () => {
  it("shows the selected building's Disable, aimed at that tile", () => {
    const html = bar([{ id: "disable_converter_structure", label: "Disable Manufactory" } as TileActionDef]);
    expect(html).toContain('data-hud-v2-action="disable_converter_structure" data-target-key="1,0"');
    expect(html).toContain(">Disable Manufactory<");
    expect(html).not.toContain("(town)");
  });

  it("shows Enable and the Aether Tower switches too", () => {
    const html = bar([
      { id: "enable_converter_structure", label: "Enable Manufactory" } as TileActionDef,
      { id: "disable_observatory", label: "Disable Aether Tower" } as TileActionDef
    ]);
    expect(html).toContain(">Enable Manufactory<");
    expect(html).toContain(">Disable Aether Tower<");
  });

  it("still leaves out the selected tile's other actions", () => {
    expect(bar([{ id: "abandon_territory", label: "Abandon Territory" } as TileActionDef])).not.toContain("Abandon Territory");
  });
});
