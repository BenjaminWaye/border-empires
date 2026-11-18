import type { FastifyInstance } from "fastify";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import type { HouseChargeResult, SeasonHouseChargesSnapshot } from "@border-empires/shared";

// House Charges after the crowning (docs/house-charges-plan.md, "Rewards"):
//   GET /hq/house-charges/season/:seasonId          the season-end reveal: every House's charges
//                                                   ("latest": the most recently crowned season)
//   GET /hq/house-charges/cards/by-player/:playerId  a player's fulfilled charges, as cards
// Public like the career routes: charges are only recorded at the crowning
// (season-crowning.ts), so nothing here exists for a season still in play.

export type RegisterHouseChargeRoutesDeps = {
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
};

export type HouseChargeRevealView = {
  seasonId: string;
  seasonSequence: number;
  endedAt: number | null;
  winnerPlayerId: string | null;
  houses: SeasonHouseChargesSnapshot[];
};

export type HouseChargeCardView = HouseChargeResult & {
  seasonId: string;
  seasonSequence: number;
  endedAt: number | null;
  playerId: string;
  playerName: string;
  /** 1-based position among every card fulfilled that season, and how many there were. */
  collectorNumber: number;
  collectorTotal: number;
  /** Earned by the House that also won the season. */
  foil: boolean;
};

type EndedSeason = { seasonId: string; seasonSequence: number; endedAt: number | null; winnerPlayerId: string | null; houses: SeasonHouseChargesSnapshot[] };

/** Every crowned season with recorded charges: the ended current season (not yet archived) first, then the archive. */
const endedSeasons = async (deps: RegisterHouseChargeRoutesDeps): Promise<EndedSeason[]> => {
  const seasons: EndedSeason[] = [];
  const current = await deps.getCurrentSeasonSummary().catch(() => undefined);
  if (current?.seasonWinner && current.seasonHouseCharges) {
    seasons.push({
      seasonId: current.seasonId,
      seasonSequence: current.seasonSequence,
      endedAt: current.endedAt ?? null,
      winnerPlayerId: current.seasonWinner.playerId,
      houses: current.seasonHouseCharges
    });
  }
  for (const archive of await deps.listSeasonArchives()) {
    if (!archive.houseCharges || seasons.some((season) => season.seasonId === archive.seasonId)) continue;
    seasons.push({
      seasonId: archive.seasonId,
      seasonSequence: archive.seasonSequence,
      endedAt: archive.endedAt,
      winnerPlayerId: archive.winner?.playerId ?? null,
      houses: archive.houseCharges
    });
  }
  return seasons;
};

/** One season's fulfilled charges as cards, numbered in a stable order (player, then charge id). */
export const seasonCards = (season: EndedSeason): HouseChargeCardView[] => {
  const held = season.houses
    .flatMap((house) => house.charges.filter((charge) => charge.held).map((charge) => ({ house, charge })))
    .sort((a, b) => a.house.playerId.localeCompare(b.house.playerId) || a.charge.id.localeCompare(b.charge.id));
  return held.map(({ house, charge }, index) => ({
    ...charge,
    seasonId: season.seasonId,
    seasonSequence: season.seasonSequence,
    endedAt: season.endedAt,
    playerId: house.playerId,
    playerName: house.playerName,
    collectorNumber: index + 1,
    collectorTotal: held.length,
    foil: season.winnerPlayerId === house.playerId
  }));
};

export const registerHouseChargeRoutes = (app: FastifyInstance, deps: RegisterHouseChargeRoutesDeps): void => {
  app.get("/hq/house-charges/season/:seasonId", async (request, reply) => {
    const seasonId = (request.params as { seasonId?: string }).seasonId;
    const seasons = await endedSeasons(deps);
    const season = seasonId === "latest" ? seasons.sort((a, b) => (b.endedAt ?? Infinity) - (a.endedAt ?? Infinity))[0] : seasons.find((entry) => entry.seasonId === seasonId);
    if (!season) {
      reply.code(404);
      return { ok: false, error: "no House Charges recorded for that season" };
    }
    const view: HouseChargeRevealView = season;
    return view;
  });

  app.get("/hq/house-charges/cards/by-player/:playerId", async (request, reply) => {
    const playerId = (request.params as { playerId?: string }).playerId;
    if (!playerId) {
      reply.code(400);
      return { ok: false, error: "playerId is required" };
    }
    const cards = (await endedSeasons(deps))
      .flatMap((season) => seasonCards(season).filter((card) => card.playerId === playerId))
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0) || a.collectorNumber - b.collectorNumber);
    return { cards };
  });
};
