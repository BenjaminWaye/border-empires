// Playtest 2026-11-21: an ungarrisoned town's screen showed COIN "—" and an active-looking "+360" manpower
// cap, so nothing said the town was giving nothing. Its stats now say it isn't garrisoned.
import { describe, expect, it } from "vitest";
import { townScreenRegions, type TownGarrisonState } from "./client-hud-v2-town.js";
import type { Tile, TileMenuView } from "../client-types.js";

const town = { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", town: { name: "Quartzcrown", type: "FARMING", populationTier: "TOWN", population: 23_791 } } as Tile;
const view = { title: "Quartzcrown", subtitle: "", actions: [], buildings: [], crystal: [], tabs: ["actions"], overviewLines: [] } as unknown as TileMenuView;
const left = (garrison?: TownGarrisonState): string =>
  townScreenRegions({ town, focus: town, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined, garrison }).left;

describe("town screen garrison stats", () => {
  it("shows Not garrisoned in place of the coin dash, and the manpower as not yet started", () => {
    const html = left("none");
    expect(html).toMatch(/COIN<\/span><span class="v2t-stat-v v2t-warn">Not garrisoned/);
    expect(html).toMatch(/MANPOWER CAP<\/span><span class="v2t-stat-v v2t-warn">\+[\d,]+<\/span><span class="v2t-stat-n">Starts once garrisoned/);
  });

  it("reads Garrisoning… while the garrison is on its way", () => {
    expect(left("on_its_way")).toMatch(/COIN<\/span><span class="v2t-stat-v">Garrisoning…/);
  });

  it("keeps the normal coin stat and gold manpower once garrisoned", () => {
    const html = left();
    expect(html).not.toMatch(/garrison/i);
    expect(html).toMatch(/MANPOWER CAP<\/span><span class="v2t-stat-v v2t-gold">/);
  });
});
