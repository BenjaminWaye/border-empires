import { describe, expect, it } from "vitest";
import { revealEmpireStatsDossierHtml, revealEmpireStatsFeedText } from "./client-empire-intel.js";
import type { RevealEmpireStatsView } from "../client-types.js";

const stats: RevealEmpireStatsView = {
  playerId: "enemy-1",
  playerName: "Needle <Empire>",
  revealedAt: 1_000,
  tiles: 24,
  settledTiles: 15,
  frontierTiles: 9,
  controlledTowns: 3,
  incomePerMinute: 12.5,
  techCount: 4,
  gold: 1234,
  manpower: 800,
  manpowerCap: 1200,
  strategicResources: {
    FOOD: 10,
    IRON: 20,
    CRYSTAL: 30,
    SUPPLY: 40,
    SHARD: 1
  }
};

describe("empire intel rendering", () => {
  it("renders the reveal stats result as a dismissible dossier", () => {
    const html = revealEmpireStatsDossierHtml(stats);
    expect(html).toContain("intel-modal");
    expect(html).toContain("data-intel-close");
    expect(html).toContain("Needle &lt;Empire&gt;");
    expect(html).toContain("Strategic stockpiles");
    expect(html).toContain("1,234");
  });

  it("keeps the compact feed summary", () => {
    expect(revealEmpireStatsFeedText(stats)).toContain("12.5/m");
    expect(revealEmpireStatsFeedText(stats)).toContain("24 tiles");
  });
});
