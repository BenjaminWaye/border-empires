// Sector Contest waitlist: GET the size of the queue for the next Sector (and
// whether the caller is on it), POST to join, DELETE to leave. A player is
// sent here by the SEASON_FULL rejection, which can arrive during socket auth
// (before any session exists) or in reply to JOIN_SEASON, so these are plain
// HTTP routes authenticated with the Firebase bearer token, like rally links.
//
// Once the Sector has ended, the same list is the commitment to the next
// Sector Contest (see next-contest/next-contest.ts), so joining stays open.
//
// Joining needs a real account: a guest (anonymous Firebase user) is lost on
// uninstall and has no email to notify, so it is asked to sign in first.
import type { FastifyInstance } from "fastify";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";

export type SectorWaitlistRouteDeps = {
  store: SectorWaitlistStore;
  authenticateBearer: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  getCurrentSeason: () => Promise<{ seasonId: string; status: string }>;
  now?: () => number;
  onJoined?: (playerId: string, seasonId: string, waitingCount: number) => void;
};

type WaitlistReply = { ok: true; seasonId: string; waitingCount: number; joined: boolean } | { ok: false; error: string };

const authorizationOf = (headers: Record<string, unknown>): string | undefined =>
  typeof headers.authorization === "string" && headers.authorization.startsWith("Bearer ") ? headers.authorization : undefined;

export const registerSectorWaitlistRoutes = (app: FastifyInstance, deps: SectorWaitlistRouteDeps): void => {
  const now = deps.now ?? (() => Date.now());

  const currentSeason = async (): Promise<{ seasonId: string; status: string } | undefined> => {
    try {
      return await deps.getCurrentSeason();
    } catch {
      return undefined;
    }
  };

  const identityOf = async (headers: Record<string, unknown>): Promise<GatewayResolvedIdentity | undefined> => {
    const authorization = authorizationOf(headers);
    if (!authorization) return undefined;
    try {
      return await deps.authenticateBearer(authorization);
    } catch {
      return undefined;
    }
  };

  const summary = async (seasonId: string, playerId: string | undefined): Promise<WaitlistReply> => ({
    ok: true,
    seasonId,
    waitingCount: await deps.store.count(seasonId),
    joined: playerId ? await deps.store.has(seasonId, playerId) : false
  });

  app.get("/sector/waitlist", async (request, reply): Promise<WaitlistReply> => {
    const season = await currentSeason();
    if (!season) {
      reply.code(503);
      return { ok: false, error: "season unavailable" };
    }
    const identity = await identityOf(request.headers);
    return summary(season.seasonId, identity?.playerId);
  });

  app.post("/sector/waitlist", async (request, reply): Promise<WaitlistReply> => {
    const identity = await identityOf(request.headers);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    if (identity.isGuest) {
      reply.code(403);
      return { ok: false, error: "account_required" };
    }
    const season = await currentSeason();
    if (!season) {
      reply.code(503);
      return { ok: false, error: "season unavailable" };
    }
    if (season.status === "pending") {
      reply.code(409);
      return { ok: false, error: "season has not started" };
    }
    const added = await deps.store.join({ seasonId: season.seasonId, playerId: identity.playerId, joinedAt: now() });
    const result = await summary(season.seasonId, identity.playerId);
    if (added && result.ok) deps.onJoined?.(identity.playerId, season.seasonId, result.waitingCount);
    return result;
  });

  app.delete("/sector/waitlist", async (request, reply): Promise<WaitlistReply> => {
    const identity = await identityOf(request.headers);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const season = await currentSeason();
    if (!season) {
      reply.code(503);
      return { ok: false, error: "season unavailable" };
    }
    await deps.store.leave(season.seasonId, identity.playerId);
    return summary(season.seasonId, identity.playerId);
  });
};
