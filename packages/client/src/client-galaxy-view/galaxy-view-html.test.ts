import { describe, expect, it } from "vitest";

import { renderGalaxyViewHtml, renderEmperorSectionHtml, type GalaxyViewPlanet, type GalaxyEmperorViewModel } from "./galaxy-view-html.js";

const unnamed: GalaxyViewPlanet = {
  seasonId: "season-1",
  seasonSequence: 1,
  objectiveName: "Conquest",
  crownedAt: 1_700_000_000_000,
  planetName: null,
  named: false
};

const named: GalaxyViewPlanet = {
  seasonId: "season-2",
  seasonSequence: 2,
  objectiveName: "Prosperity",
  crownedAt: 1_700_100_000_000,
  planetName: "Aethelgard",
  named: true
};

describe("renderGalaxyViewHtml", () => {
  it("renders an empty string when there are no planets", () => {
    expect(renderGalaxyViewHtml({ planets: [], focusedSeasonId: "" })).toBe("");
  });

  it("renders a christen form for an unnamed focused planet", () => {
    const html = renderGalaxyViewHtml({ planets: [unnamed], focusedSeasonId: "season-1" });
    expect(html).toContain("data-galaxy-christen");
    expect(html).toContain('data-season-id="season-1"');
    expect(html).toContain("Christen Planet");
    expect(html).not.toContain("gx-planet-name");
  });

  it("renders the named medallion for a named focused planet", () => {
    const html = renderGalaxyViewHtml({ planets: [named], focusedSeasonId: "season-2" });
    expect(html).toContain("gx-planet-name");
    expect(html).toContain("Aethelgard");
    expect(html).toContain("Prosperity");
    expect(html).not.toContain("data-galaxy-christen-form");
  });

  it("does not render a switcher row for a single planet", () => {
    const html = renderGalaxyViewHtml({ planets: [named], focusedSeasonId: "season-2" });
    expect(html).not.toContain("gx-switcher");
  });

  it("renders a switcher row for multiple planets, highlighting the focused one", () => {
    const html = renderGalaxyViewHtml({ planets: [named, unnamed], focusedSeasonId: "season-2" });
    expect(html).toContain("gx-switcher");
    expect(html).toContain('data-galaxy-focus="season-1"');
    expect(html).toContain('data-galaxy-focus="season-2"');
    expect(html).toContain("is-active");
  });

  it("falls back to the first planet when focusedSeasonId does not match any planet", () => {
    const html = renderGalaxyViewHtml({ planets: [named], focusedSeasonId: "season-missing" });
    expect(html).toContain("Aethelgard");
  });

  it("escapes HTML in planet names", () => {
    const malicious: GalaxyViewPlanet = { ...named, planetName: '<script>alert(1)</script>' };
    const html = renderGalaxyViewHtml({ planets: [malicious], focusedSeasonId: "season-2" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

const baseEmperorModel: GalaxyEmperorViewModel = {
  emperor: { playerId: "player-1", endedSeasonId: "season-1", crownedAt: 1_700_000_000_000 },
  windowOpenUntil: Date.now() + 30 * 60_000,
  endorsement: null,
  isEmperor: true
};

describe("renderEmperorSectionHtml", () => {
  it("renders an empty string when there is no active Emperor window", () => {
    const html = renderEmperorSectionHtml({ ...baseEmperorModel, emperor: null });
    expect(html).toBe("");
  });

  it("renders an empty string when the viewer is not the Emperor", () => {
    const html = renderEmperorSectionHtml({ ...baseEmperorModel, isEmperor: false });
    expect(html).toBe("");
  });

  it("renders a form and a countdown when the viewer is the Emperor", () => {
    const html = renderEmperorSectionHtml(baseEmperorModel);
    expect(html).toContain("data-galaxy-endorse-form");
    expect(html).toContain("data-galaxy-endorse-target");
    expect(html).toContain("data-galaxy-endorse-countdown");
  });

  it('renders "Currently endorsing" when an endorsement is already set', () => {
    const html = renderEmperorSectionHtml({
      ...baseEmperorModel,
      endorsement: { targetPlayerId: "player-2", createdAt: Date.now() }
    });
    expect(html).toContain("Currently endorsing");
    expect(html).toContain("player-2");
  });

  it("escapes HTML in the endorsed target player id", () => {
    const html = renderEmperorSectionHtml({
      ...baseEmperorModel,
      endorsement: { targetPlayerId: '<script>alert(1)</script>', createdAt: Date.now() }
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
