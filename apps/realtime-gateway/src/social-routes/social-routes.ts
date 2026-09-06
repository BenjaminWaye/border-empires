import type { FastifyInstance } from "fastify";

export type PublicSocialActiveTruce = {
  otherPlayerId: string;
  otherPlayerName: string;
  endsAt: number;
};

export type PublicSocialView = {
  allies: string[];
  activeTruces: PublicSocialActiveTruce[];
};

export type RegisterSocialRoutesDeps = {
  getSocialSnapshotForPlayer?: (playerId: string) => PublicSocialView;
};

// Narrows a full SocialSnapshot (social-state-types.ts) down to the public
// subset -- omits incoming/outgoing alliance and truce requests, which are
// that player's own business, not something any viewer of their profile
// should see.
export const toPublicSocialView = (snapshot: { allies: string[]; activeTruces: PublicSocialActiveTruce[] }): PublicSocialView => ({
  allies: snapshot.allies,
  activeTruces: snapshot.activeTruces
});

// Public, unauthenticated -- same reasoning as GET /hq/galaxy/by-player/:playerId
// and GET /hq/career/by-player/:playerId: the player profile page needs to
// show any player's current allies/truces, not just the viewer's own.
// Sourced from the gateway's live, in-memory SocialState (current season
// only -- unlike career stats, alliances and truces don't carry across
// seasons), so this only reflects the season currently in progress.
export const registerSocialRoutes = (app: FastifyInstance, deps: RegisterSocialRoutesDeps): void => {
  app.get("/hq/social/by-player/:playerId", async (request, reply) => {
    if (!deps.getSocialSnapshotForPlayer) {
      reply.code(503);
      return { ok: false, error: "social data is unavailable" };
    }
    const playerId = (request.params as { playerId?: string }).playerId;
    if (!playerId) {
      reply.code(400);
      return { ok: false, error: "playerId is required" };
    }
    return deps.getSocialSnapshotForPlayer(playerId);
  });
};
