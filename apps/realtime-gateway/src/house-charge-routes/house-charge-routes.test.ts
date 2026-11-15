import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import type { SeasonHouseChargesSnapshot } from "@border-empires/shared";
import { registerHouseChargeRoutes } from "./house-charge-routes.js";

const houses: SeasonHouseChargesSnapshot[] = [
  { playerId: "p2", playerName: "House Sigrid", charges: [{ id: "DESERT:r", kind: "DESERT", title: "The Ashen Reach", rarity: "COMMON", renown: 2, held: true, hoursHeld: 38, size: 174, places: ["The Ashen Reach"], art: "24x16:00" }] },
  { playerId: "p1", playerName: "House Alden", charges: [
    { id: "RELIC:x", kind: "RELIC", title: "A Concordance installation", rarity: "MYTHIC", renown: 4, held: true, hoursHeld: 92, size: 1, relicType: "FOUNDRY_HEART" },
    { id: "CHARTER:x", kind: "CHARTER", title: "Road of Vell and Harrowmere", rarity: "COMMON", renown: 2, held: false, hoursHeld: 0, size: 0, places: ["Vell", "Harrowmere"] }
  ] }
];

const app = async (current: Partial<CurrentSeasonSummary>, archives: Partial<SeasonArchiveRow>[] = []) => {
  const server = Fastify();
  registerHouseChargeRoutes(server, {
    getCurrentSeasonSummary: async () => current as CurrentSeasonSummary,
    listSeasonArchives: async () => archives as SeasonArchiveRow[]
  });
  await server.ready();
  return server;
};

describe("House Charge routes", () => {
  it("reveals a crowned season's charges, and nothing for a season still in play", async () => {
    const running = await app({ seasonId: "s2", seasonSequence: 2 });
    expect((await running.inject({ method: "GET", url: "/hq/house-charges/season/s2" })).statusCode).toBe(404);
    const crowned = await app({ seasonId: "s2", seasonSequence: 2, endedAt: 9_000, seasonWinner: { playerId: "p1" } as never, seasonHouseCharges: houses });
    const reveal = (await crowned.inject({ method: "GET", url: "/hq/house-charges/season/s2" })).json();
    expect(reveal).toMatchObject({ seasonId: "s2", winnerPlayerId: "p1" });
    expect(reveal.houses).toHaveLength(2);
    expect((await crowned.inject({ method: "GET", url: "/hq/house-charges/season/latest" })).json()).toMatchObject({ seasonId: "s2" });
  });

  it("lists a player's fulfilled charges as numbered cards, foil for the season winner", async () => {
    const server = await app({ seasonId: "s3", seasonSequence: 3 }, [{ seasonId: "s2", seasonSequence: 2, endedAt: 9_000, winner: { playerId: "p1" } as never, houseCharges: houses }]);
    const { cards } = (await server.inject({ method: "GET", url: "/hq/house-charges/cards/by-player/p1" })).json();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "RELIC:x", foil: true, collectorNumber: 1, collectorTotal: 2, seasonSequence: 2, playerName: "House Alden" });
    const other = (await server.inject({ method: "GET", url: "/hq/house-charges/cards/by-player/p2" })).json().cards;
    expect(other[0]).toMatchObject({ foil: false, collectorNumber: 2, collectorTotal: 2, art: "24x16:00" });
  });
});
