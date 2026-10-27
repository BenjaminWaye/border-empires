// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderEconomyRowsHtml, type EconomyRowsInput } from "./client-economy-rows.js";

const slot = (supply: number, demand: number, sources: EconomyRowsInput["slots"]["FOOD"]["sources"] = [], occupants: EconomyRowsInput["slots"]["FOOD"]["occupants"] = []) =>
  ({ supply, demand, sources, occupants });

const input = (over: Partial<EconomyRowsInput> = {}): EconomyRowsInput => ({
  focus: "ALL",
  gold: 13.4,
  coin: { netPerMinute: 58 / 1440, sources: [{ label: "Town", amountPerMinute: 40 / 1440, count: 3 }], sinks: [{ label: "Umbrite Works", amountPerMinute: 2 / 1440, count: 1, resourceKey: "UMBRITE" }] },
  slots: {
    FOOD: slot(10, 9, [{ label: "Farm", amountPerMinute: 4, count: 4 }], [{ label: "Town support", amountPerMinute: 9, count: 3 }]),
    TITANIUM: slot(2, 0),
    CRYSTAL: slot(0, 0),
    UMBRITE: slot(1, 2, [], [{ label: "Siege Battery", amountPerMinute: 2, count: 2, dormantCount: 1 }])
  },
  isRevealed: (r) => r !== "CRYSTAL",
  foodCoverage: 1,
  resourceIconHtml: () => "",
  ...over
});

const render = (i: EconomyRowsInput): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = renderEconomyRowsHtml(i);
  return host;
};

describe("Economy rows (new HUD)", () => {
  // Regression: Crystal was missing, Integrity sat among the resources, and the cards overflowed the panel.
  it("shows one row per resource, Crystal included, and no Integrity", () => {
    const host = render(input());
    expect(Array.from(host.querySelectorAll<HTMLElement>("[data-v2e-row]")).map((r) => r.dataset.v2eRow)).toEqual(["GOLD", "FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"]);
    expect(host.textContent).not.toContain("Integrity");
    expect(host.querySelector("[data-v2e-row='CRYSTAL']")?.textContent).toContain("Not discovered");
  });

  it("gives used / supply, where supply comes from and what uses it", () => {
    const food = render(input()).querySelector("[data-v2e-row='FOOD']")!;
    expect(food.textContent).toContain("9 / 10");
    expect(food.textContent).toContain("1 free");
    expect(food.textContent).toContain("Farm ×4");
    expect(food.textContent).toContain("Town support ×3");
  });

  it("flags a shortfall and the dormant users it causes", () => {
    const umbrite = render(input()).querySelector("[data-v2e-row='UMBRITE']")!;
    expect(umbrite.classList.contains("v2e-short")).toBe(true);
    expect(umbrite.textContent).toContain("Short 1");
    expect(umbrite.textContent).toContain("1 dormant");
  });

  it("highlights the row for the chip that opened the panel", () => {
    expect(render(input({ focus: "TITANIUM" })).querySelector(".v2e-focus")?.getAttribute("data-v2e-row")).toBe("TITANIUM");
  });

  // Review: upkeep paid in another resource read as Coin/day.
  it("names the resource of upkeep that is not paid in coin", () => {
    expect(render(input()).querySelector("[data-v2e-row='GOLD']")?.textContent).toContain("−2.0/day Umbrite");
  });
});
