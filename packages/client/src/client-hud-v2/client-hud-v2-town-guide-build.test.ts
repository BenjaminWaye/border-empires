// Owner report 2026-11-28: during the guide's Manufactory step the town screen's bottom bar showed a
// "Build Manufactory" button next to Abandon Territory. The guide copied the build into the tile's
// actions; it now lives only in the Build list, marked Recommended and opened on its tab.
import { afterEach, describe, expect, it } from "vitest";
import { townScreenRegions } from "./client-hud-v2-town.js";
import { injectGuideManufactoryRecommendation, setGuideManufactoryTargets } from "../client-tutorial-guide/tutorial-guide-manufactory-recommendation.js";
import type { Tile, TileMenuView } from "../client-types.js";

const town = { x: 90, y: 300, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "Quartzspire", type: "MARKET", populationTier: "TOWN", population: 22_397 } } as Tile;
const townTileView = (): TileMenuView => ({
  title: "Quartzspire", subtitle: "", crystal: [], overviewLines: [], tabs: ["actions", "buildings"],
  actions: [{ id: "abandon_territory", label: "Abandon Territory" }],
  buildings: [
    { id: "build_fort", label: "Build Fort" },
    { id: "build_farm_plot", label: "Build Farm Plot" },
    { id: "build_manufactory", label: "Build Manufactory" }
  ]
}) as unknown as TileMenuView;

// The town tile itself selected, as in the report: its own actions fill the bottom bar.
const regions = (view: TileMenuView) =>
  townScreenRegions({ town, focus: town, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined });

afterEach(() => setGuideManufactoryTargets(undefined));

describe("town screen during the guide's Manufactory step", () => {
  it("keeps Build Manufactory out of the bottom bar", () => {
    setGuideManufactoryTargets([{ x: town.x, y: town.y }]);
    const view = townTileView();
    injectGuideManufactoryRecommendation(view, town);
    const { bar } = regions(view);
    expect(bar).toContain('data-hud-v2-action="abandon_territory"');
    expect(bar).not.toContain("build_manufactory");
  });

  it("opens Build on the Manufactory's tab with it first and marked Recommended", () => {
    setGuideManufactoryTargets([{ x: town.x, y: town.y }]);
    const view = townTileView();
    injectGuideManufactoryRecommendation(view, town);
    const { build } = regions(view);
    expect(build).toMatch(/class="v2t-tab v2t-tab-on"[^>]*data-v2-build-category="town_support">★ Town Support/);
    const picks = [...build.matchAll(/data-v2-build-pick="([^"]+)"/g)].map((m) => m[1]);
    expect(picks[0]).toBe("build_manufactory");
    expect(build).toMatch(/class="v2t-build v2t-build-rec"[^>]*data-v2-build-pick="build_manufactory"[\s\S]*?★ Recommended/);
  });

  it("shows no badge outside the guide step", () => {
    const { build } = regions(townTileView());
    expect(build).not.toContain("★");
  });
});
