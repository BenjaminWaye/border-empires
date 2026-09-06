import type {
  CurrentSeasonSummary,
  GalaxySpecialization,
  SeasonArchiveRow,
  SeasonWinnerStats
} from "@border-empires/sim-protocol";
import type { FastifyInstance } from "fastify";
import { specializationForVictoryPath } from "@border-empires/sim-protocol";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { validatePlanetName } from "../galaxy-name-policy/galaxy-name-policy.js";
import { bearerHeader } from "../bearer-header/bearer-header.js";
import { resolveEndedSeasons, resolveCurrentOwnerAuthUid, winnerAuthUid } from "../galaxy-holdings/galaxy-holdings.js";

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
  // Influence/Production balance + per-territory Stability (galactic v1,
  // docs/galactic-campaign-design.md §4/§7). Optional like the other galaxy
  // deps: /hq/galaxy/me degrades to the v0 shape (no `economy` field) if
  // this isn't wired up.
  galaxyEconomyStore?: GalaxyEconomyStore;
  // §7/§11 Defense Campaign ownership transfers. Optional like the other
  // galaxy deps: without it, ownership always resolves to the original
  // winner, matching behavior before Defense Campaigns existed.
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore;
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
  stability?: number;
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
  stability?: number;
};

// Player's current galactic economy balance (§4). Only present on
// /hq/galaxy/me when galaxyEconomyStore is wired up.
type GalaxyEconomyView = {
  influence: number;
  production: number;
};

type GalaxyStipendView = {
  seasonId: string;
  seasonSequence: number;
  tier: "STIPEND";
  awardedAt: number;
  influence: number;
  production: number;
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
    const authBindingStore = deps.authBindingStore;
    const { won: wonSeasons, tiered: tieredSeasons } = await resolveEndedSeasons(deps);

    const planets: GalaxyMePlanetView[] = [];
    for (const season of wonSeasons) {
      const uid = await resolveCurrentOwnerAuthUid(season, authBindingStore, deps.galaxyDefenseCampaignStore);
      if (uid !== authUid) continue;
      const record = await deps.galaxyPlanetStore.getBySeasonId(season.seasonId);
      const stability = deps.galaxyEconomyStore
        ? (await deps.galaxyEconomyStore.ensureStability({ authUid, seasonId: season.seasonId, tier: "PLANET" })).stability
        : undefined;
      planets.push({
        seasonId: season.seasonId,
        seasonSequence: season.seasonSequence,
        tier: "PLANET",
        objectiveName: season.winner.objectiveName,
        specialization: specializationForVictoryPath(season.winner.objectiveId),
        crownedAt: season.winner.crownedAt,
        planetName: record?.planetName ?? null,
        named: Boolean(record),
        ...(season.winner.stats ? { stats: season.winner.stats } : {}),
        ...(stability !== undefined ? { stability } : {})
      });
    }
    planets.sort((a, b) => b.crownedAt - a.crownedAt);

    // Outposts/Stipends (§3): every non-winning competitive player's own
    // galaxyTiers entry for a given season, if this account's authUid is
    // bound to that entry's per-season playerId. Every distinct playerId
    // across all tiered seasons is resolved to its authUid concurrently
    // (rather than one sequential lookup per season × tier record) — the
    // same playerId can also recur across multiple seasons, so the lookup is
    // deduped, not just parallelized.
    const tierPlayerIds = new Set<string>();
    for (const season of tieredSeasons) {
      for (const tier of season.galaxyTiers) tierPlayerIds.add(tier.playerId);
    }
    const tierUidByPlayerId = new Map<string, string | undefined>(
      await Promise.all(
        [...tierPlayerIds].map(async (playerId): Promise<[string, string | undefined]> => [
          playerId,
          (await authBindingStore.getByPlayerId(playerId))?.uid
        ])
      )
    );

    const outposts: GalaxyOutpostView[] = [];
    const stipends: GalaxyStipendView[] = [];
    for (const season of tieredSeasons) {
      for (const tier of season.galaxyTiers) {
        if (tierUidByPlayerId.get(tier.playerId) !== authUid) continue;
        if (tier.tier === "OUTPOST" && tier.specialization) {
          const outpostStability = deps.galaxyEconomyStore
            ? (await deps.galaxyEconomyStore.ensureStability({ authUid, seasonId: season.seasonId, tier: "OUTPOST" })).stability
            : undefined;
          outposts.push({
            seasonId: season.seasonId,
            seasonSequence: season.seasonSequence,
            tier: "OUTPOST",
            specialization: tier.specialization,
            awardedAt: season.endedAt,
            holderName: tier.playerName,
            ...(outpostStability !== undefined ? { stability: outpostStability } : {})
          });
        } else if (tier.tier === "STIPEND") {
          stipends.push({ seasonId: season.seasonId, seasonSequence: season.seasonSequence, tier: "STIPEND", awardedAt: season.endedAt, influence: tier.influence ?? 0, production: tier.production ?? 0 });
        }
      }
    }
    outposts.sort((a, b) => b.awardedAt - a.awardedAt);
    stipends.sort((a, b) => b.awardedAt - a.awardedAt);

    let economy: GalaxyEconomyView | undefined;
    const economyStore = deps.galaxyEconomyStore;
    if (economyStore) {
      const balance = await economyStore.getBalance(authUid);
      economy = { influence: balance?.influence ?? 0, production: balance?.production ?? 0 };
    }

    return { planets, outposts, stipends, ...(economy ? { economy } : {}) };
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
    const { won: wonSeasons } = await resolveEndedSeasons(deps);
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
    const { won: wonSeasons, tiered: tieredSeasons } = await resolveEndedSeasons(deps);
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

  // Public, unauthenticated: lets the player profile page (client-player-profile.ts)
  // show any player's galactic holdings, not just the viewer's own (unlike
  // /hq/galaxy/me, which is bearer-authed and self-only). Resolves this
  // season's playerId to its durable authUid via the same auth-binding store
  // used everywhere else in this file, then reuses the /hq/galaxy shape
  // (no stability/economy -- those stay private to /hq/galaxy/me).
  app.get("/hq/galaxy/by-player/:playerId", async (request, reply) => {
    if (!deps.galaxyPlanetStore || !deps.authBindingStore) {
      reply.code(503);
      return { ok: false, error: "galaxy is unavailable" };
    }
    const playerId = (request.params as { playerId?: string }).playerId;
    if (!playerId) {
      reply.code(400);
      return { ok: false, error: "playerId is required" };
    }
    const binding = await deps.authBindingStore.getByPlayerId(playerId);
    if (!binding) return { planets: [], outposts: [] };
    const authUid = binding.uid;

    const galaxyPlanetStore = deps.galaxyPlanetStore;
    const authBindingStore = deps.authBindingStore;
    const { won: wonSeasons, tiered: tieredSeasons } = await resolveEndedSeasons(deps);

    const planets: GalaxyPublicPlanetView[] = [];
    for (const season of wonSeasons) {
      const uid = await resolveCurrentOwnerAuthUid(season, authBindingStore, deps.galaxyDefenseCampaignStore);
      if (uid !== authUid) continue;
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
    planets.sort((a, b) => b.crownedAt - a.crownedAt);

    // Same dedup-then-parallelize shape as /hq/galaxy/me above: resolve each
    // distinct tier playerId's authUid once, concurrently, rather than one
    // sequential lookup per season x tier record.
    const tierPlayerIds = new Set<string>();
    for (const season of tieredSeasons) {
      for (const tier of season.galaxyTiers) tierPlayerIds.add(tier.playerId);
    }
    const tierUidByPlayerId = new Map<string, string | undefined>(
      await Promise.all(
        [...tierPlayerIds].map(async (tierPlayerId): Promise<[string, string | undefined]> => [
          tierPlayerId,
          (await authBindingStore.getByPlayerId(tierPlayerId))?.uid
        ])
      )
    );

    const outposts: GalaxyOutpostView[] = [];
    for (const season of tieredSeasons) {
      for (const tier of season.galaxyTiers) {
        if (tier.tier !== "OUTPOST" || !tier.specialization) continue;
        if (tierUidByPlayerId.get(tier.playerId) !== authUid) continue;
        outposts.push({ seasonId: season.seasonId, seasonSequence: season.seasonSequence, tier: "OUTPOST", specialization: tier.specialization, awardedAt: season.endedAt, holderName: tier.playerName });
      }
    }
    outposts.sort((a, b) => b.awardedAt - a.awardedAt);
    return { planets, outposts };
  });
};
