// Public House profile (docs/gdd.md §7).
//   GET    /public/house/:publicId     anyone with the link; read-only
//   GET    /hq/public-profile/link     the caller's own link, if they made one
//   POST   /hq/public-profile/link     make (or return) the caller's link
//   DELETE /hq/public-profile/link     stop sharing; the old link stops working
// The public route answers 404 for an unknown id, an account with no login
// binding, and an account whose deletion was requested, so a deleted House's
// page is gone as soon as the request is accepted, before the operator's
// erasure removes the link row itself.
import type { FastifyInstance } from "fastify";
import type { SeasonArchiveRow, SeasonParticipationRow } from "@border-empires/sim-protocol";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import { buildPublicHouseProfileView, type PublicHouseProfileView } from "./public-house-profile-view.js";
import { isPublicProfileId, type PublicProfileLinkStore } from "./public-profile-link-store.js";

export type PublicHouseProfileRouteDeps = {
  store: PublicProfileLinkStore;
  authenticateBearer: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  /** "active" only for an account with a login binding and no deletion request. */
  accountState: (playerId: string) => Promise<"active" | "missing" | "deleting">;
  getDisplayName: (playerId: string) => Promise<string | undefined>;
  getSeasonParticipationForPlayer: (playerId: string) => Promise<SeasonParticipationRow[]>;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  now?: () => number;
};

type LinkReply = { ok: true; publicId: string | null } | { ok: false; error: string };
type PublicReply = PublicHouseProfileView | { ok: false; error: string };

export const registerPublicHouseProfileRoutes = (app: FastifyInstance, deps: PublicHouseProfileRouteDeps): void => {
  const now = deps.now ?? (() => Date.now());

  const identityOf = async (headers: Record<string, unknown>): Promise<GatewayResolvedIdentity | undefined> => {
    const authorization = typeof headers.authorization === "string" && headers.authorization.startsWith("Bearer ") ? headers.authorization : undefined;
    if (!authorization) return undefined;
    try {
      return await deps.authenticateBearer(authorization);
    } catch {
      return undefined;
    }
  };

  app.get("/public/house/:publicId", async (request, reply): Promise<PublicReply> => {
    const notFound = (): PublicReply => {
      reply.code(404).header("Cache-Control", "no-store");
      return { ok: false, error: "not_found" };
    };
    const publicId = (request.params as { publicId?: string }).publicId;
    if (!isPublicProfileId(publicId)) return notFound();
    const link = await deps.store.getByPublicId(publicId);
    if (!link) return notFound();
    if ((await deps.accountState(link.playerId)) !== "active") return notFound();
    try {
      const [participation, archives, storedName] = await Promise.all([
        deps.getSeasonParticipationForPlayer(link.playerId),
        deps.listSeasonArchives(),
        deps.getDisplayName(link.playerId)
      ]);
      const name = storedName?.trim() || [...participation].sort((a, b) => b.endedAt - a.endedAt)[0]?.playerName || "Unnamed House";
      // Short cache: a page must not outlive a deletion or "stop sharing" by long.
      reply.header("Cache-Control", "public, max-age=60");
      return buildPublicHouseProfileView({ playerId: link.playerId, name, participation, archives });
    } catch {
      reply.code(503).header("Cache-Control", "no-store");
      return { ok: false, error: "unavailable" };
    }
  });

  app.get("/hq/public-profile/link", async (request, reply): Promise<LinkReply> => {
    const identity = await identityOf(request.headers);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    return { ok: true, publicId: (await deps.store.getByPlayerId(identity.playerId))?.publicId ?? null };
  });

  app.post("/hq/public-profile/link", async (request, reply): Promise<LinkReply> => {
    const identity = await identityOf(request.headers);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    // A guest login is lost on uninstall and its House has no lasting identity to show.
    if (identity.isGuest) {
      reply.code(403);
      return { ok: false, error: "account_required" };
    }
    return { ok: true, publicId: (await deps.store.getOrCreate(identity.playerId, now())).publicId };
  });

  app.delete("/hq/public-profile/link", async (request, reply): Promise<LinkReply> => {
    const identity = await identityOf(request.headers);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    await deps.store.remove(identity.playerId);
    return { ok: true, publicId: null };
  });
};
