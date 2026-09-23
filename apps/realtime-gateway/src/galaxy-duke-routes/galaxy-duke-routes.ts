import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import { bearerHeader } from "../bearer-header/bearer-header.js";
import type { BuildSpec } from "../galaxy-duke-engine/galaxy-duke-production.js";
import type { DukeActionResult } from "../galaxy-duke-service/galaxy-duke-actions.js";
import type { GalaxyDukeService } from "../galaxy-duke-service/galaxy-duke-service.js";

export type RegisterGalaxyDukeRoutesDeps = {
  authenticateBearer?: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  galaxyDukeService?: GalaxyDukeService;
};

type Body = Record<string, unknown>;
const bodyOf = (request: FastifyRequest): Body => (request.body && typeof request.body === "object" ? (request.body as Body) : {});

const parseBuildSpec = (body: Body): BuildSpec | undefined => {
  if (body.kind === "FIGHTER" || body.kind === "PROBE" || body.kind === "REFIT") return { kind: body.kind };
  if (body.kind === "FORTIFY" && typeof body.seasonId === "string" && typeof body.points === "number") {
    return { kind: "FORTIFY", seasonId: body.seasonId, points: body.points };
  }
  return undefined;
};

// Every failure is a 4xx with a machine-readable `code` the client turns into
// plain language; only "not a Duke" and bad input are distinguished by status.
const statusFor = (result: Extract<DukeActionResult, { ok: false }>): number =>
  result.code === "NOT_A_DUKE" ? 403 : result.code === "INVALID" ? 400 : 409;

export const registerGalaxyDukeRoutes = (app: FastifyInstance, deps: RegisterGalaxyDukeRoutesDeps): void => {
  const service = deps.galaxyDukeService;

  // Public: the shared Court Strength meter (§21.2) needs no login.
  app.get("/hq/galaxy/court", async (_request, reply) => {
    if (!service) {
      reply.code(503);
      return { ok: false, error: "the Court is unavailable" };
    }
    return { ok: true, court: await service.court() };
  });

  const authed = async (request: FastifyRequest, reply: FastifyReply): Promise<string | undefined> => {
    if (!service || !deps.authenticateBearer) {
      reply.code(503);
      return undefined;
    }
    const identity = await deps.authenticateBearer(bearerHeader(request));
    if (!identity?.authUid) {
      reply.code(401);
      return undefined;
    }
    return identity.authUid;
  };

  const respond = (reply: FastifyReply, result: DukeActionResult): { ok: boolean; [key: string]: unknown } => {
    if (result.ok) return { ok: true };
    reply.code(statusFor(result));
    return { ok: false, code: result.code, ...("availableAt" in result ? { availableAt: result.availableAt } : {}) };
  };

  app.get("/hq/galaxy/duke", async (request, reply) => {
    const authUid = await authed(request, reply);
    if (!authUid) return { ok: false, error: "unavailable or unauthorized" };
    const status = await service!.status(authUid);
    if (!status) {
      reply.code(403);
      return { ok: false, code: "NOT_A_DUKE" };
    }
    return { ok: true, duke: status };
  });

  app.post("/hq/galaxy/duke/invest", async (request, reply) => {
    const authUid = await authed(request, reply);
    if (!authUid) return { ok: false, error: "unavailable or unauthorized" };
    const spec = parseBuildSpec(bodyOf(request));
    if (!spec) {
      reply.code(400);
      return { ok: false, code: "INVALID" };
    }
    return respond(reply, await service!.invest(authUid, spec));
  });

  app.post("/hq/galaxy/duke/invest/cancel", async (request, reply) => {
    const authUid = await authed(request, reply);
    if (!authUid) return { ok: false, error: "unavailable or unauthorized" };
    return respond(reply, await service!.cancelBuild(authUid));
  });

  app.post("/hq/galaxy/duke/order", async (request, reply) => {
    const authUid = await authed(request, reply);
    if (!authUid) return { ok: false, error: "unavailable or unauthorized" };
    const body = bodyOf(request);
    if ((body.kind !== "PROBE" && body.kind !== "RAID") || typeof body.seasonId !== "string" || !body.seasonId) {
      reply.code(400);
      return { ok: false, code: "INVALID" };
    }
    return respond(reply, await service!.order(authUid, { kind: body.kind, seasonId: body.seasonId }));
  });

  app.post("/hq/galaxy/duke/court-offer", async (request, reply) => {
    const authUid = await authed(request, reply);
    if (!authUid) return { ok: false, error: "unavailable or unauthorized" };
    const body = bodyOf(request);
    if (typeof body.accept !== "boolean") {
      reply.code(400);
      return { ok: false, code: "INVALID" };
    }
    return respond(reply, await service!.answerCourtOffer(authUid, body.accept));
  });

  app.post("/hq/galaxy/duke/court/move", async (request, reply) => {
    const authUid = await authed(request, reply);
    if (!authUid) return { ok: false, error: "unavailable or unauthorized" };
    const body = bodyOf(request);
    if (typeof body.influence !== "number") {
      reply.code(400);
      return { ok: false, code: "INVALID" };
    }
    return respond(reply, await service!.moveAgainstCourt(authUid, body.influence));
  });
};
