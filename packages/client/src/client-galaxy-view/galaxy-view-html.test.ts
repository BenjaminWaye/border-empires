import { describe, expect, it } from "vitest";
import { GALAXY_SPECIALIZATION_NAME } from "@border-empires/sim-protocol";

import {
  renderGalaxyViewHtml,
  renderEmperorSectionHtml,
  SPECIALIZATION_LABEL,
  type GalaxyViewPlanet,
  type GalaxyEmperorViewModel
} from "./galaxy-view-html.js";

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

  it("renders a specialization badge with its display label when present", () => {
    const html = renderGalaxyViewHtml({
      planets: [{ ...named, specialization: "CAPITAL" }],
      focusedSeasonId: "season-2"
    });
    expect(html).toContain("gx-specialization");
    expect(html).toContain("Capital World");
  });

  it("renders no specialization badge when the field is absent (pre-specialization archives)", () => {
    const html = renderGalaxyViewHtml({ planets: [named], focusedSeasonId: "season-2" });
    expect(html).not.toContain("gx-specialization");
  });

  it("falls back to the raw specialization id when it has no known display label", () => {
    const html = renderGalaxyViewHtml({
      planets: [{ ...named, specialization: "FUTURE_ID" }],
      focusedSeasonId: "season-2"
    });
    expect(html).toContain("FUTURE_ID World");
  });

  it("keeps its local specialization label copy in sync with @border-empires/sim-protocol's GALAXY_SPECIALIZATION_NAME", () => {
    // SPECIALIZATION_LABEL is duplicated here rather than imported at runtime
    // (see the comment above its definition) to avoid pulling sim-protocol's
    // dependency graph into the client bundle. This test is what stands in
    // for that import: it fails the moment the two definitions diverge.
    expect(SPECIALIZATION_LABEL).toEqual(GALAXY_SPECIALIZATION_NAME);
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

describe("renderGalaxyViewHtml — Outpost/Stipend tiers (§3)", () => {
  it("renders an Outpost row with its specialization badge", () => {
    const html = renderGalaxyViewHtml({
      planets: [],
      focusedSeasonId: "",
      outposts: [{ seasonId: "season-2", seasonSequence: 2, specialization: "EXTRACTION", awardedAt: 1_000 }],
      stipends: []
    });
    expect(html).toContain("data-galaxy-outpost");
    expect(html).toContain("Season 2 Outpost");
    expect(html).toContain(GALAXY_SPECIALIZATION_NAME.EXTRACTION);
  });

  it("renders a one-line Stipend row with its Inf/Prod payout", () => {
    const html = renderGalaxyViewHtml({
      planets: [],
      focusedSeasonId: "",
      outposts: [],
      stipends: [{ seasonId: "season-3", seasonSequence: 3, influence: 9, production: 36, awardedAt: 1_000 }]
    });
    expect(html).toContain("data-galaxy-stipend");
    expect(html).toContain("9 Inf");
    expect(html).toContain("36 Prod");
  });

  it("renders nothing when there are no planets, outposts, or stipends", () => {
    expect(renderGalaxyViewHtml({ planets: [], focusedSeasonId: "", outposts: [], stipends: [] })).toBe("");
  });

  it("renders outposts/stipends alongside a focused planet hero", () => {
    const html = renderGalaxyViewHtml({
      planets: [{ seasonId: "s1", seasonSequence: 1, objectiveName: "Conquest", crownedAt: 1_000, planetName: "Home", named: true }],
      focusedSeasonId: "s1",
      outposts: [{ seasonId: "season-2", seasonSequence: 2, awardedAt: 1_000 }],
      stipends: []
    });
    expect(html).toContain("data-galaxy-starfield");
    expect(html).toContain("data-galaxy-outpost");
  });

  it("renders a Stability readout on the named medallion when stability is present", () => {
    const html = renderGalaxyViewHtml({ planets: [{ ...named, stability: 63 }], focusedSeasonId: "season-2" });
    expect(html).toContain("data-galaxy-stability");
    expect(html).toContain("Stability 63");
  });

  it("omits the Stability readout when stability is absent (v0-only gateway)", () => {
    const html = renderGalaxyViewHtml({ planets: [named], focusedSeasonId: "season-2" });
    expect(html).not.toContain("data-galaxy-stability");
  });

  it("renders an Influence/Production readout when economy is present", () => {
    const html = renderGalaxyViewHtml({
      planets: [named],
      focusedSeasonId: "season-2",
      economy: { influence: 12, production: 40 }
    });
    expect(html).toContain("data-galaxy-economy");
    expect(html).toContain("12 Inf");
    expect(html).toContain("40 Prod");
  });

  it("omits the economy readout when economy is absent", () => {
    const html = renderGalaxyViewHtml({ planets: [named], focusedSeasonId: "season-2" });
    expect(html).not.toContain("data-galaxy-economy");
  });
});
