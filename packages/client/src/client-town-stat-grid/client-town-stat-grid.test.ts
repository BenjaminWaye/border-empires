import { describe, expect, it } from "vitest";
import { townStatGridHtml } from "./client-town-stat-grid.js";

describe("townStatGridHtml", () => {
  const baseInput = {
    population: 22_640,
    maxPopulation: 50_000,
    populationTierLabel: "Town",
    growthText: "+16.7/m — City in ~4d",
    growthTone: "positive" as const,
    goldPerDayLabel: "5,472.0",
    manpowerCapLabel: "300",
    manpowerRegenLabel: "+0.42/min base regen"
  };

  it("renders Population, Gold, and Manpower as full-width cards", () => {
    const html = townStatGridHtml(baseInput);
    expect(html).toContain("Population · Town");
    expect(html).toContain("22,640");
    expect(html).toContain("/ 50,000");
    expect(html).toContain("+16.7/m — City in ~4d");
    expect(html).toContain("Gold production");
    expect(html).toContain("5,472.0");
    expect(html).toContain("Manpower contribution");
    expect(html).toContain("300");
    expect(html).toContain("+0.42/min base regen");
  });

  it("renders Support and Food as a compact mini-row when provided", () => {
    const html = townStatGridHtml({
      ...baseInput,
      support: { current: 7, max: 8 },
      food: { satisfied: 4, demand: 4, fed: true }
    });
    expect(html).toContain(`<div class="tile-stat-mini-row">`);
    expect(html).toContain("7 / 8");
    expect(html).toContain("4 / 4");
    expect(html).not.toContain("unfed");
  });

  it("marks an unfed Food mini-stat without a red/negative CSS class", () => {
    const html = townStatGridHtml({
      ...baseInput,
      food: { satisfied: 0, demand: 4, fed: false }
    });
    expect(html).toContain("0 / 4 — unfed");
    expect(html).toContain("tile-stat-mini-value is-attn");
    expect(html).not.toContain("is-negative");
  });

  it("omits the mini-row entirely for a SETTLEMENT tier (no support/food)", () => {
    const html = townStatGridHtml(baseInput);
    expect(html).not.toContain("tile-stat-mini-row");
  });

  it("escapes HTML-significant characters in text fields", () => {
    const html = townStatGridHtml({ ...baseInput, growthText: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows population against the next tier threshold, not the absolute cap", () => {
    const html = townStatGridHtml({ ...baseInput, nextTierPopulation: 30_000 });
    expect(html).toContain("22,640");
    expect(html).toContain("/ 30,000");
    expect(html).not.toContain("/ 50,000");
  });

  it("marks the meter tier-ready once population reaches the next tier threshold", () => {
    const html = townStatGridHtml({ ...baseInput, population: 30_000, nextTierPopulation: 30_000 });
    expect(html).toContain(`<span class="is-tier-ready" style="width:100.0%">`);
  });

  it("does not mark the meter tier-ready below the next tier threshold", () => {
    const html = townStatGridHtml({ ...baseInput, nextTierPopulation: 30_000 });
    expect(html).not.toContain("is-tier-ready");
  });

  it("falls back to population/maxPopulation when there is no next tier (already at max tier)", () => {
    const html = townStatGridHtml(baseInput);
    expect(html).toContain("/ 50,000");
    expect(html).not.toContain("is-tier-ready");
  });
});
