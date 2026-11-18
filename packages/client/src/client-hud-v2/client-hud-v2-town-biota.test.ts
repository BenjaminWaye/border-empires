// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { terrainAdjustedTownManpower } from "@border-empires/shared";
import type { Tile, TileMenuView } from "../client-types.js";
import { townScreenRegions } from "./client-hud-v2-town.js";
import { createInitialState } from "../client-state/client-state.js";
import { screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { screenClick } from "./client-hud-v2-screens.js";
import type { BiotaStep } from "./client-hud-v2-town-biota-steps.js";

const view = { title: "Lumenwake", actions: [], buildings: [] } as unknown as TileMenuView;
const city = {
  x: 4, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  town: {
    name: "Lumenwake", type: "MARKET", baseGoldPerMinute: 2, supportCurrent: 8, supportMax: 8, goldPerMinute: 5, cap: 0,
    isFed: true, population: 168_585, maxPopulation: 1_000_000, populationTier: "CITY", connectedTownCount: 0, connectedTownBonus: 0,
    hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false
  }
} as unknown as Tile;
const left = (biota?: { received: number; needed: number; manpowerTier: "TOWN" | "CITY"; local?: number }, biotaSteps: BiotaStep[] = []) =>
  townScreenRegions({
    town: city, focus: city, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined,
    ...(biota ? { biota: { tileKey: "4,4", ...biota } } : {}), biotaSteps
  }).left;
const unruly = { received: 0, needed: 1, manpowerTier: "TOWN" as const };
const cap = (tier: "TOWN" | "CITY") => `+${Math.round(terrainAdjustedTownManpower(tier, undefined, false).cap).toLocaleString("en-US")}`;

// Playtest 2026-11-17: an unruly City's town screen never mentioned biota and
// showed the City's full manpower cap while it was giving a Town's.
describe("HUD v2 town screen luxury biota", () => {
  afterEach(() => {
    screen.id = null;
    document.body.innerHTML = "";
  });

  it("says how many of a town's biota slots its own Vivaria cover, and offers a Vivarium when short", () => {
    const html = left({ received: 1, needed: 1, manpowerTier: "CITY", local: 1 });
    expect(html).toContain("● 1 of 1 (1 from Vivaria) · Full manpower");
    const short = left(unruly, [{ kind: "vivarium", researched: true }]);
    expect(short).toContain('data-v2-info-structure="VIVARIUM"');
    expect(short).toContain("Or build a");
    expect(short).toContain("+1 slot each");
    expect(left(unruly, [{ kind: "vivarium", researched: false }])).toContain("Or research Census Office for a");
  });

  it("shows an unruly town's biota shortfall and the manpower it actually gives", () => {
    const html = left(unruly);
    expect(html).toContain("Unruly · luxury biota");
    expect(html).toContain("○ 0 of 1");
    expect(html).toContain("Unruly · 0% of biota need met");
    expect(html).toContain(cap("TOWN"));
    expect(cap("TOWN")).not.toBe(cap("CITY"));
  });

  it("shows a supplied town as full manpower", () => {
    const html = left({ received: 1, needed: 1, manpowerTier: "CITY" }, [{ kind: "search" }]);
    expect(html).toContain("● 1 of 1 · Full manpower");
    expect(html).toContain(cap("CITY"));
    expect(html).not.toContain("Unruly");
    expect(html).not.toContain("No biota seen");
  });

  it("lists the next steps: the charter, where biota is, and what to build", () => {
    expect(left(unruly, [{ kind: "research", techId: "frontier-concessions", techName: "Frontier Export Charter" }, { kind: "search" }]))
      .toContain('Research <button type="button" class="inline-info-link" data-view-tech="frontier-concessions">Frontier Export Charter</button>');
    expect(left(unruly, [{ kind: "search" }])).toContain("No biota seen yet · grows in grassland, plains, jungle and marsh");
    expect(left(unruly, [{ kind: "capture", x: 30, y: 12 }])).toContain('Nearest biota <button type="button" class="inline-info-link" data-v2-town-goto="30,12"');
    expect(left(unruly, [{ kind: "build", x: 5, y: 6 }])).toContain(">Cultivation Estate</button> (+2 slots) on your biota at ");
    expect(left(unruly, [{ kind: "taken", slots: 2 }])).toContain("2 slots go to towns held longer");
  });

  it("opens the Cultivation Estate info card from the town screen", () => {
    document.body.innerHTML = `<div id="hud-v2-screen">${left(unruly, [{ kind: "build", x: 5, y: 6 }])}</div>`;
    let rendered = 0;
    const state = createInitialState();
    const deps = { state, renderHud: () => { rendered += 1; } } as unknown as HudV2Deps;
    screen.id = "town";
    const link = document.querySelector('[data-v2-info-structure="CULTIVATION_ESTATE"]');
    expect(link).not.toBeNull();
    expect(screenClick(deps, link as Element)).toBe(true);
    expect(state.structureInfoKey).toBe("CULTIVATION_ESTATE");
    expect(rendered).toBe(1);
  });

  it("leaves biota out for a town that needs none", () => {
    expect(left()).not.toContain("biota");
  });

  it("opens the charter in the Manifest from the town screen", () => {
    document.body.innerHTML = `<div id="hud-v2-screen">${left(unruly, [{ kind: "research", techId: "frontier-concessions", techName: "Frontier Export Charter" }])}</div>`;
    const state = createInitialState();
    const deps = { state, renderHud: () => undefined } as unknown as HudV2Deps;
    screen.id = "town";
    expect(screenClick(deps, document.querySelector("[data-view-tech]") as Element)).toBe(true);
    expect(state.techUiSelectedId).toBe("frontier-concessions");
    expect(state.techDetailOpen).toBe(true);
  });
});
