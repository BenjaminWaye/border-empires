// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { EMPIRE_INTEGRITY_INCOME_LABEL, EMPIRE_STORAGE_FLOOR, townFoodSlotDemandForTier } from "@border-empires/shared";
import { emptyEconomyBreakdown, type EconomyBreakdown } from "../client-economy-model.js";
import type { Tile } from "../client-types.js";
import { renderEconomyPanelHtml, SLOT_WAIVER_LABEL, type EconomyPanelArgs } from "./client-economy-html.js";

const perMin = (perDay: number): number => perDay / 1440;

const args = (over: Partial<EconomyPanelArgs>): EconomyPanelArgs => ({
  focus: "ALL",
  gold: 46.5,
  me: "me",
  incomePerMinute: 0,
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
  storageCap: EMPIRE_STORAGE_FLOOR,
  resourceSlots: { supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } },
  dormantStructures: [],
  strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
  upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
  upkeepLastTick: { foodCoverage: 1 },
  activeRevealTargetsCount: 0,
  tiles: [],
  economyBreakdown: undefined,
  prettyToken: (value) => value,
  resourceIconHtml: () => "",
  rateToneClass: () => "positive",
  resourceLabel: (resource) => resource,
  economicStructureName: (type) => type,
  ...over
});

const render = (a: EconomyPanelArgs): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = renderEconomyPanelHtml(a);
  return host;
};

/** The signed per-day amounts on a list's lines, in order. */
const listAmounts = (row: Element, heading: string): number[] => {
  const list = Array.from(row.querySelectorAll(".v2e-list")).find((l) => l.querySelector(".v2e-list-h")?.textContent === heading);
  return Array.from(list?.querySelectorAll(".v2e-item b") ?? []).map((b) => Number((b.textContent ?? "").replace("−", "-").replace(/[^0-9.+-]/g, "")));
};

const optimiserBreakdown = (): EconomyBreakdown => {
  const breakdown = emptyEconomyBreakdown();
  breakdown.GOLD.sources = [
    { label: "Towns", amountPerMinute: perMin(26.4), count: 1 },
    { label: "Automated Fabrication Complex", amountPerMinute: perMin(10), count: 1 },
    { label: EMPIRE_INTEGRITY_INCOME_LABEL, amountPerMinute: perMin(4.368), count: 1 }
  ];
  return breakdown;
};

describe("Economy panel coin row reads the one shared breakdown", () => {
  // Playtest (optimiser): headline +40.9/day over lines Towns +26.4 and AFC +10.0, with the +12% nowhere.
  it("lists the Empire Integrity bonus so the Earned lines add up to the headline", () => {
    const coin = render(args({ incomePerMinute: perMin(40.768), economyBreakdown: optimiserBreakdown() })).querySelector("[data-v2e-row='GOLD']")!;
    expect(coin.querySelector(".v2e-status")?.textContent).toBe("+40.8/day");
    expect(coin.textContent).toContain(EMPIRE_INTEGRITY_INCOME_LABEL);
    expect(listAmounts(coin, "Earned").reduce((a, b) => a + b, 0)).toBeCloseTo(40.8, 1);
  });

  it("folds lines past the fourth into a '+N more' line that carries their amount", () => {
    const breakdown = emptyEconomyBreakdown();
    breakdown.GOLD.sources = [1, 2, 3, 4, 5, 6].map((n) => ({ label: `Source ${n}`, amountPerMinute: perMin(n), count: 1 }));
    const coin = render(args({ incomePerMinute: perMin(21), economyBreakdown: breakdown })).querySelector("[data-v2e-row='GOLD']")!;
    expect(coin.textContent).toContain("+2 more");
    expect(listAmounts(coin, "Earned").reduce((a, b) => a + b, 0)).toBeCloseTo(21, 1);
  });
});

describe("Economy panel Food row", () => {
  // Playtest: "Town support 4" + Manufactory ×3 + Palisade 1 = 8 listed, total 6 (Founding Concession's −2 unlisted).
  it("shows server-applied slot waivers as their own line so Used by adds up to the total", () => {
    const town = { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { populationTier: "TOWN" } } as Tile;
    const base = townFoodSlotDemandForTier("TOWN");
    const food = render(args({
      tiles: [town],
      resourceSlots: { supply: { FOOD: 12, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: base - 2, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } }
    })).querySelector("[data-v2e-row='FOOD']")!;
    expect(food.textContent).toContain(`${base - 2} / 12`);
    expect(food.textContent).toContain(SLOT_WAIVER_LABEL);
    expect(listAmounts(food, "Used by")).toEqual([base, -2]);
  });
});
