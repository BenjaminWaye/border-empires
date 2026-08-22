import type {
  CurrentSeasonSummary,
  GalaxySpecialization,
  SeasonArchiveRow,
  SeasonGalaxyTierSnapshot,
  SeasonWinnerSnapshot,
  SeasonWinnerStats
} from "@border-empires/sim-protocol";
import type { FastifyInstance } from "fastify";
import { specializationForVictoryPath } from "@border-empires/sim-protocol";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import { validatePlanetName } from "../galaxy-name-policy/galaxy-name-policy.js";

export type RegisterGalaxyRoutesDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  // `season_archive` rows (and thus `listSeasonArchives`) are only written
  // when a season is actually rolled over (start-next-season). A season that
  // just ended with a crowned winner sits on the season-end screen with its
  // winner recorded only on the *current* summary until that rollover
  // happens. Without this dep, a freshly-crowned winner would see nothing in
  // the galaxy until someone successfully starts the next season.
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authenticateBearer?: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  galaxyPlanetStore?: GalaxyPlanetStore;
  authBindingStore?: GatewayAuthBindingStore;
};

type WonSeason = {
  seasonId: string;
  seasonSequence: number;
  winner: SeasonWinnerSnapshot;
};

// Seasons carrying galaxyTiers (§3 Outpost/Stipend records for non-winners),
// resolved the same way WonSeason is: archived rows plus the current season
// if it ended but hasn't rolled over yet (see resolveWonSeasons).
type TieredSeason = {
  seasonId: string;
  seasonSequence: number;
  endedAt: number;
  galaxyTiers: SeasonGalaxyTierSnapshot[];
};

type GalaxyMePlanetView = {
  seasonId: string;
  seasonSequence: number;
  tier: "PLANET";
  objectiveName: string;
  specialization: GalaxySpecialization;
  crownedAt: number;
  planetName: string | null;
  named: boolean;
  stats?: SeasonWinnerStats;
};

type GalaxyPublicPlanetView = {
  seasonId: string;
  seasonSequence: number;
  tier: "PLANET";
  objectiveName: string;
  specialization: GalaxySpecialization;
  crownedAt: number;
  claimed: boolean;
  planetName: string | null;
  stats?: SeasonWinnerStats;
};

// Outposts are public territory like Planets (§3: "minor permanent
// holding"), so both /hq/galaxy/me and /hq/galaxy surface them — unlike
// Stipends (one-time payouts, no territory), which only appear on /hq/galaxy/me.
type GalaxyOutpostView = {
  seasonId: string;
  seasonSequence: number;
  tier: "OUTPOST";
  specialization: GalaxySpecialization;
  awardedAt: number;
  holderName: string;
};

type GalaxyStipendView = {
  seasonId: string;
  seasonSequence: number;
  tier: "STIPEND";
  awardedAt: number;
  influence: number;
  production: number;
};

const bearerHeader = (request: { headers: Record<string, unknown> }): string | undefined =>
  typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;

// Combines archived (rolled-over) season winners with the current season's
// winner, if it has been crowned but not yet archived, so a season sitting on
// the season-end screen is visible in the galaxy immediately rather than only
// after the next season successfully starts.
const resolveWonSeasons = async (deps: RegisterGalaxyRoutesDeps): Promise<WonSeason[]> => {
  const archives = await deps.listSeasonArchives();
  const won: WonSeason[] = [];
  for (const archive of archives) {
    if (archive.winner) won.push({ seasonId: archive.seasonId, seasonSequence: archive.seasonSequence, winner: archive.winner });
  }

  if (deps.getCurrentSeasonSummary) {
    const current = await deps.getCurrentSeasonSummary();
    const alreadyArchived = won.some((season) => season.seasonId === current.seasonId);
    if (current.status === "ended" && current.seasonWinner && !alreadyArchived) {
      won.push({ seasonId: current.seasonId, seasonSequence: current.seasonSequence, winner: current.seasonWinner });
    }
  }
  return won;
};

// Same shape as resolveWonSeasons, for the galactic Outpost/Stipend tier
// records (§3) instead of the season's overall winner.
const resolveTieredSeasons = async (deps: RegisterGalaxyRoutesDeps): Promise<TieredSeason[]> => {
  const archives = await deps.listSeasonArchives();
  const tiered: TieredSeason[] = [];
  for (const archive of archives) {
    if (archive.galaxyTiers && archive.galaxyTiers.length > 0) {
      tiered.push({ seasonId: archive.seasonId, seasonSequence: archive.seasonSequence, endedAt: archive.endedAt, galaxyTiers: archive.galaxyTiers });
    }
  }

  if (deps.getCurrentSeasonSummary) {
    const current = await deps.getCurrentSeasonSummary();
    const alreadyArchived = tiered.some((season) => season.seasonId === current.seasonId);
    if (current.status === "ended" && current.seasonGalaxyTiers && current.seasonGalaxyTiers.length > 0 && !alreadyArchived) {
      tiered.push({
        seasonId: current.seasonId,
        seasonSequence: current.seasonSequence,
        endedAt: current.endedAt ?? current.updatedAt,
        galaxyTiers: current.seasonGalaxyTiers
      });
    }
  }
  return tiered;
};

// Resolves the durable authUid that won a given season, or undefined if the
// winner has no bound account (an AI/unclaimed win — "unclaimed frontier").
// This is the sole bridge between the per-season playerId and the galaxy's
// cross-season authUid identity.
const winnerAuthUid = async (season: WonSeason, authBindingStore: GatewayAuthBindingStore): Promise<string | undefined> => {
  const binding = await authBindingStore.getByPlayerId(season.winner.playerId);
  return binding?.uid;
};

export const registerGalaxyRoutes = (app: FastifyInstance, deps: RegisterGalaxyRoutesDeps): void => {
  app.get("/hq/galaxy/me", async (request, reply) => {
    if (!deps.authenticateBearer || !deps.galaxyPlanetStore || !deps.authBindingStore) {
      reply.code(503);
      return { ok: false, error: "galaxy is unavailable" };
    }
    const identity = await deps.authenticateBearer(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const authUid = identity.authUid;
    const wonSeasons = await resolveWonSeasons(deps);
    const planets: GalaxyMePlanetView[] = [];
    for (const season of wonSeasons) {
      const uid = await winnerAuthUid(season, deps.authBindingStore);
      if (uid !== authUid) continue;
      const record = await deps.galaxyPlanetStore.getBySeasonId(season.seasonId);
      planets.push({
        seasonId: season.seasonId,
        seasonSequence: season.seasonSequence,
        tier: "PLANET",
        objectiveName: season.winner.objectiveName,
        specialization: specializationForVictoryPath(season.winner.objectiveId),
        crownedAt: season.winner.crownedAt,
        planetName: record?.planetName ?? null,
        named: Boolean(record),
        ...(season.winner.stats ? { stats: season.winner.stats } : {})
      });
    }
    planets.sort((a, b) => b.crownedAt - a.crownedAt);

    // Outposts/Stipends (§3): every non-winning competitive player's own
    // galaxyTiers entry for a given season, if this account's authUid is
    // bound to that entry's per-season playerId.
    const tieredSeasons = await resolveTieredSeasons(deps);
    const outposts: GalaxyOutpostView[] = [];
    const stipends: GalaxyStipendView[] = [];
    for (const season of tieredSeasons) {
      for (const tier of season.galaxyTiers) {
        const binding = await deps.authBindingStore.getByPlayerId(tier.playerId);
        if (binding?.uid !== authUid) continue;
        if (tier.tier === "OUTPOST" && tier.specialization) {
          outposts.push({ seasonId: season.seasonId, seasonSequence: season.seasonSequence, tier: "OUTPOST", specialization: tier.specialization, awardedAt: season.endedAt, holderName: tier.playerName });
        } else if (tier.tier === "STIPEND") {
          stipends.push({ seasonId: season.seasonId, seasonSequence: season.seasonSequence, tier: "STIPEND", awardedAt: season.endedAt, influence: tier.influence ?? 0, production: tier.production ?? 0 });
        }
      }
    }
    outposts.sort((a, b) => b.awardedAt - a.awardedAt);
    stipends.sort((a, b) => b.awardedAt - a.awardedAt);
    return { planets, outposts, stipends };
  });

  app.post("/hq/galaxy/planets/:seasonId/name", async (request, reply) => {
    if (!deps.authenticateBearer || !deps.galaxyPlanetStore || !deps.authBindingStore) {
      reply.code(503);
      return { ok: false, error: "galaxy is unavailable" };
    }
    const identity = await deps.authenticateBearer(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const seasonId = (request.params as { seasonId?: string }).seasonId;
    if (!seasonId) {
      reply.code(400);
      return { ok: false, error: "seasonId is required" };
    }
    const wonSeasons = await resolveWonSeasons(deps);
    const season = wonSeasons.find((candidate) => candidate.seasonId === seasonId);
    if (!season) {
      reply.code(404);
      return { ok: false, error: "season not found or has no winner" };
    }
    const uid = await winnerAuthUid(season, deps.authBindingStore);
    if (uid !== identity.authUid) {
      reply.code(403);
      return { ok: false, error: "you did not win this season" };
    }
    const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
    const rawName = typeof body.planetName === "string" ? body.planetName : "";
    const validated = validatePlanetName(rawName);
    if (!validated.ok) {
      reply.code(400);
      return { ok: false, error: validated.reason };
    }
    const { inserted, record } = await deps.galaxyPlanetStore.christen({
      seasonId,
      ownerAuthUid: identity.authUid,
      planetName: validated.name
    });
    if (!inserted) {
      reply.code(409);
      return { ok: false, error: "planet already named" };
    }
    return { ok: true, planet: record };
  });

  app.get("/hq/galaxy", async (_request, reply) => {
    if (!deps.galaxyPlanetStore) {
      reply.code(503);
      return { ok: false, error: "galaxy is unavailable" };
    }
    const galaxyPlanetStore = deps.galaxyPlanetStore;
    const wonSeasons = await resolveWonSeasons(deps);
    const planets: GalaxyPublicPlanetView[] = [];
    for (const season of wonSeasons) {
      const record = await galaxyPlanetStore.getBySeasonId(season.seasonId);
      planets.push({
        seasonId: season.seasonId,
        seasonSequence: season.seasonSequence,
        tier: "PLANET",
        objectiveName: season.winner.objectiveName,
        specialization: specializationForVictoryPath(season.winner.objectiveId),
        crownedAt: season.winner.crownedAt,
        claimed: Boolean(record),
        planetName: record?.planetName ?? null,
        ...(season.winner.stats ? { stats: season.winner.stats } : {})
      });
    }

    // Outposts are public territory like Planets (§3). Stipends are a
    // one-time payout with no territory, so — unlike Outposts — they're
    // deliberately left off the public listing; they still exist as a tier
    // concept (surfaced privately via /hq/galaxy/me).
    const tieredSeasons = await resolveTieredSeasons(deps);
    const outposts: GalaxyOutpostView[] = [];
    for (const season of tieredSeasons) {
      for (const tier of season.galaxyTiers) {
        if (tier.tier !== "OUTPOST" || !tier.specialization) continue;
        outposts.push({ seasonId: season.seasonId, seasonSequence: season.seasonSequence, tier: "OUTPOST", specialization: tier.specialization, awardedAt: season.endedAt, holderName: tier.playerName });
      }
    }
    outposts.sort((a, b) => b.awardedAt - a.awardedAt);
    return { planets, outposts };
  });
};
