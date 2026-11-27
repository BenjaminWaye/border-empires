// Regression: "Garrison N plots" took the gold slot from the selected plot's own resource improvement, which then
// appeared nowhere on the bar.
import { describe, expect, it } from "vitest";
import { townScreenRegions } from "./client-hud-v2-town.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

const town = { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "T", type: "FARMING", populationTier: "CITY" } } as Tile;
const plot = { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile;
const view = (actions: TileActionDef[]): TileMenuView =>
  ({ title: "T", subtitle: "", actions, buildings: [], crystal: [], tabs: ["actions"], overviewLines: [] }) as unknown as TileMenuView;
const plots = { id: "garrison_town_plots", label: "Garrison 3 plots", cost: "30 manpower" } as TileActionDef;
const improve = { id: "build_hydrogarden", label: "Build Hydrogarden", cost: "50 coin" } as TileActionDef;
const bar = (focus: Tile, focusActions: TileActionDef[]): string =>
  townScreenRegions({ town, focus, townView: view([plots]), focusView: view(focusActions), townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined }).bar;

describe("town screen Garrison N plots button", () => {
  it("is the gold main button when nothing else claims the slot", () => {
    expect(bar(town, [])).toMatch(/class="v2t-act v2t-act-primary"[^>]*data-hud-v2-action="garrison_town_plots"/);
  });

  it("keeps the selected plot's improvement as the gold button and shows the plots button beside it", () => {
    const html = bar(plot, [improve]);
    expect(html).toMatch(/class="v2t-act v2t-act-primary" data-hud-v2-action="build_hydrogarden"/);
    expect(html).toContain('data-hud-v2-action="garrison_town_plots"');
    expect(html).not.toMatch(/v2t-act-primary"[^>]*data-hud-v2-action="garrison_town_plots"/);
  });
});
