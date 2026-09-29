// The rally-link routes (create/list/lookup/revoke), split out of
// http-routes.ts -- already over the file-line cap and not allowed to grow
// -- so this cohesive feature has its own home instead of adding lines to
// that file. Takes the same deps object registerGatewayHttpRoutes already
// has in scope, plus the resolved playOrigin it computes; this is purely an
// extraction, not a behavior change.
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import { rallyAnchorFromTiles } from "../rally-link-anchor.js";
import { rallyLinkIsActive, toRallyLinkPublicView, type RallyAnchor, type RallyLink } from "../rally-link-store/rally-link-store.js";
import type { RegisterGatewayHttpRoutesDeps } from "./http-routes.js";

export const registerRallyLinkRoutes = (app: FastifyInstance, deps: RegisterGatewayHttpRoutesDeps, playOrigin: string): void => {
  const bearerToken = (authorizationHeader: string | undefined): string | undefined => {
    if (!authorizationHeader?.startsWith("Bearer ")) return undefined;
    const token = authorizationHeader.slice("Bearer ".length).trim();
    return token.length > 0 ? token : undefined;
  };

  const requireRallyAuth = async (authorizationHeader: string | undefined): Promise<GatewayResolvedIdentity | undefined> => {
    if (!bearerToken(authorizationHeader)) return undefined;
    return deps.authenticateBearer?.(authorizationHeader);
  };

  const activeOwnerAnchor = async (playerId: string): Promise<RallyAnchor | undefined> => {
    if (!deps.subscribePlayer) return undefined;
    const snapshot = await deps.subscribePlayer(playerId);
    return rallyAnchorFromTiles(playerId, snapshot.tiles);
  };

  const seasonIsActive = async (): Promise<boolean> => {
    try {
      return (await deps.getCurrentSeasonStatus()) === "active";
    } catch {
      return false;
    }
  };

  const publicRallyView = async (link: RallyLink, now: number) => {
    if (!rallyLinkIsActive(link, now)) return undefined;
    if (!(await seasonIsActive())) return undefined;
    if (!(await activeOwnerAnchor(link.ownerPlayerId))) return undefined;
    return toRallyLinkPublicView(link, playOrigin);
  };

  app.post("/rally/links", async (request, reply) => {
    if (!deps.rallyLinkStore || !deps.authenticateBearer || !deps.preparePlayer || !deps.subscribePlayer) {
      reply.code(503);
      return { ok: false, error: "rally links are unavailable" };
    }
    const identity = await requireRallyAuth(typeof request.headers.authorization === "string" ? request.headers.authorization : undefined);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    if (!(await seasonIsActive())) {
      reply.code(409);
      return { ok: false, error: "season is not active" };
    }
    const now = Date.now();
    const active = await deps.rallyLinkStore.listActiveForOwner(identity.playerId, now);
    if (active.length >= 10) {
      reply.code(429);
      return { ok: false, error: "active rally link limit reached" };
    }
    const createdLastHour = await deps.rallyLinkStore.countCreatedSince(identity.playerId, now - 60 * 60_000);
    if (createdLastHour >= 5) {
      reply.code(429);
      return { ok: false, error: "rally link creation rate limit reached" };
    }
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const ttlHours = typeof body.ttlHours === "number" && Number.isFinite(body.ttlHours)
      ? Math.min(24 * 30, Math.max(1, Math.floor(body.ttlHours)))
      : 168;
    const maxUses = typeof body.maxUses === "number" && Number.isFinite(body.maxUses)
      ? Math.min(50, Math.max(1, Math.floor(body.maxUses)))
      : 5;
    const note = typeof body.note === "string" && body.note.trim().length > 0 ? body.note.trim().slice(0, 120) : undefined;

    await deps.preparePlayer(identity.playerId, { isGuest: identity.isGuest === true });
    const anchor = await activeOwnerAnchor(identity.playerId);
    if (!anchor) {
      reply.code(409);
      return { ok: false, error: "owner has no active empire anchor" };
    }
    const link = await deps.rallyLinkStore.create({
      code: `r_${randomBytes(9).toString("base64url")}`,
      ownerPlayerId: identity.playerId,
      ownerName: identity.playerName,
      ...(note ? { note } : {}),
      anchor,
      createdAt: now,
      expiresAt: now + ttlHours * 60 * 60_000,
      maxUses
    });
    return toRallyLinkPublicView(link, playOrigin);
  });

  app.get("/rally/links/mine", async (request, reply) => {
    if (!deps.rallyLinkStore || !deps.authenticateBearer) {
      reply.code(503);
      return { ok: false, error: "rally links are unavailable" };
    }
    const identity = await requireRallyAuth(typeof request.headers.authorization === "string" ? request.headers.authorization : undefined);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const now = Date.now();
    const links = await Promise.all((await deps.rallyLinkStore.listActiveForOwner(identity.playerId, now)).map((link) => publicRallyView(link, now)));
    return { links: links.filter((link): link is NonNullable<typeof link> => Boolean(link)) };
  });

  app.get("/rally/links/:code", async (request, reply) => {
    if (!deps.rallyLinkStore) {
      reply.code(503);
      return { ok: false, error: "rally links are unavailable" };
    }
    const code = (request.params as { code?: string }).code ?? "";
    const link = await deps.rallyLinkStore.get(code);
    const view = link ? await publicRallyView(link, Date.now()) : undefined;
    if (!view) {
      reply.code(404);
      return { ok: false, error: "rally link not found" };
    }
    return view;
  });

  app.delete("/rally/links/:code", async (request, reply) => {
    if (!deps.rallyLinkStore || !deps.authenticateBearer) {
      reply.code(503);
      return { ok: false, error: "rally links are unavailable" };
    }
    const identity = await requireRallyAuth(typeof request.headers.authorization === "string" ? request.headers.authorization : undefined);
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const code = (request.params as { code?: string }).code ?? "";
    const revoked = await deps.rallyLinkStore.revoke(identity.playerId, code, Date.now());
    if (!revoked) {
      reply.code(404);
      return { ok: false, error: "rally link not found" };
    }
    return { ok: true };
  });
};
