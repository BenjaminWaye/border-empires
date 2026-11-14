import { describe, expect, it } from "vitest";
import { encodeChargeArt } from "@border-empires/shared";
import { houseChargeCardHtml, houseChargeCollectionHtml, houseChargeCardRule, type HouseChargeCardView } from "./client-house-charge-cards.js";
import { houseChargeRevealHtml } from "./client-house-charge-reveal.js";

const card = (overrides: Partial<HouseChargeCardView> = {}): HouseChargeCardView => ({
  id: "CHARTER:x",
  kind: "CHARTER",
  title: "Road of Vell and Harrowmere",
  rarity: "COMMON",
  renown: 2,
  held: true,
  hoursHeld: 61,
  size: 22,
  places: ["Vell", "Harrowmere"],
  art: encodeChargeArt([{ x: 8, y: 15 }, { x: 9, y: 15 }, { x: 10, y: 15 }, { x: 10, y: 16 }], 640, 320)!,
  seasonId: "s12",
  seasonSequence: 12,
  endedAt: 9_000,
  playerId: "p1",
  playerName: "House Alden",
  collectorNumber: 14,
  collectorTotal: 212,
  foil: false,
  ...overrides
});

describe("House Charge cards", () => {
  it("renders a trading card with name, real-shape art, type line, rule, stats and footer", () => {
    const html = houseChargeCardHtml(card());
    expect(html).toContain("Road of Vell and Harrowmere");
    expect(html).toContain("House Charge — Charter of Passage");
    expect(html).toContain("Connected Vell and Harrowmere with an unbroken road");
    expect(html).toContain("22 / 61");
    expect(html).toContain("14/212 · Contest 12 · House Alden");
    expect(html.match(/<rect /g)?.length).toBeGreaterThan(3);
    expect(html).not.toContain("is-foil");
  });

  it("marks the season winner's cards as foil and names a held relic's family", () => {
    const { art: _art, places: _places, ...pointCard } = card({ kind: "RELIC", rarity: "MYTHIC", relicType: "CONSCRIPTION_ENGINE", foil: true, size: 1 });
    const relic = houseChargeCardHtml(pointCard);
    expect(relic).toContain("is-foil");
    expect(relic).toContain("Foil · season winner");
    expect(relic).toContain("the Ancillary Vault");
    expect(relic).toContain("I / 61");
    expect(houseChargeCardRule({ kind: "RELIC" })).toContain("a Concordance installation");
  });

  it("explains an empty collection differently on your own profile", () => {
    expect(houseChargeCollectionHtml([], true)).toContain("Fulfil a House Charge");
    expect(houseChargeCollectionHtml([], false)).toBe('<p class="v2p-none">No charge cards yet.</p>');
    expect(houseChargeCollectionHtml("loading", false)).toContain("Loading");
    expect(houseChargeCollectionHtml([card(), card({ id: "b" })], false).match(/class="hc-card /g)).toHaveLength(2);
  });
});

describe("season-end reveal", () => {
  const view = {
    seasonId: "s12",
    seasonSequence: 12,
    endedAt: 9_000,
    winnerPlayerId: "p1",
    houses: [
      { playerId: "p2", playerName: "House Sigrid", charges: [{ id: "d", kind: "DESERT" as const, title: "The Ashen Reach", rarity: "COMMON" as const, renown: 2, held: false, hoursHeld: 0, size: 12 }] },
      { playerId: "p1", playerName: "House Alden", charges: [{ id: "r", kind: "RELIC" as const, title: "A Concordance installation", rarity: "MYTHIC" as const, renown: 4, held: true, hoursHeld: 92, size: 1 }] }
    ]
  };
  const badge = (_id: string, name: string) => `<b>${name}</b>`;

  it("lists every House's charges, yours first, with held hours", () => {
    const html = houseChargeRevealHtml({ key: "k", view }, badge, "p2");
    expect(html.indexOf("House Sigrid")).toBeLessThan(html.indexOf("House Alden"));
    expect(html).toContain("Held · 92 h");
    expect(html).toContain("Not held");
    expect(html).toContain("1 charge fulfilled");
  });

  it("shows loading and empty states", () => {
    expect(houseChargeRevealHtml({ key: "k", view: "loading" }, badge, undefined)).toContain("Unsealing");
    expect(houseChargeRevealHtml({ key: "k", view: "missing" }, badge, undefined)).toContain("No House Charges were recorded");
  });
});
