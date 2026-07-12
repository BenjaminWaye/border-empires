import type { FastifyInstance } from "fastify";
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";

import type { GatewayResolvedIdentity } from "../auth-identity/auth-identity.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEndorsementStore } from "../galaxy-endorsement-store/galaxy-endorsement-store.js";

// Emperor = winner of the most recently ended season, for the one-hour
// window between that season ending and the next one auto-starting (see
// galaxy-endorsement-auto-start.ts). Once the next season is live, there is
// no active Emperor until *that* season ends in turn.
export const IMPERIAL_WARD_ENDORSEMENT_WINDOW_MS = 60 * 60_000;

export type RegisterGalaxyEndorsementRoutesDeps = {
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authenticateBearer?: (authorizationHeader: string | undefined) => Promise<GatewayResolvedIdentity | undefined>;
  endorsementStore?: GalaxyEndorsementStore;
  authBindingStore?: GatewayAuthBindingStore;
  now?: () => number;
};

const bearerHeader = (request: { headers: Record<string, unknown> }): string | undefined =>
  typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;

// Returns the current Emperor window, or undefined if the season is still
// active (no one has just been crowned) or has no winner to anchor a window.
const currentEmperorWindow = (
  summary: CurrentSeasonSummary
): { endedSeasonId: string; emperorPlayerId: string; crownedAt: number } | undefined => {
  if (summary.status !== "ended" || !summary.seasonWinner) return undefined;
  return {
    endedSeasonId: summary.seasonId,
    emperorPlayerId: summary.seasonWinner.playerId,
    crownedAt: summary.seasonWinner.crownedAt
  };
};

export const registerGalaxyEndorsementRoutes = (app: FastifyInstance, deps: RegisterGalaxyEndorsementRoutesDeps): void => {
  const now = deps.now ?? (() => Date.now());

  app.get("/hq/galaxy/emperor", async (request, reply) => {
    if (!deps.getCurrentSeasonSummary || !deps.authenticateBearer || !deps.endorsementStore) {
      reply.code(503);
      return { ok: false, error: "galaxy is unavailable" };
    }
    const summary = await deps.getCurrentSeasonSummary();
    const window = currentEmperorWindow(summary);
    if (!window) return { ok: true, emperor: null, windowOpenUntil: null, endorsement: null, isEmperor: false };

    const identity = await deps.authenticateBearer(bearerHeader(request));
    const endorsement = await deps.endorsementStore.getByEndedSeasonId(window.endedSeasonId);
    return {
      ok: true,
      emperor: { playerId: window.emperorPlayerId, endedSeasonId: window.endedSeasonId, crownedAt: window.crownedAt },
      windowOpenUntil: window.crownedAt + IMPERIAL_WARD_ENDORSEMENT_WINDOW_MS,
      endorsement: endorsement ? { targetPlayerId: endorsement.targetPlayerId, createdAt: endorsement.createdAt } : null,
      isEmperor: identity?.playerId === window.emperorPlayerId
    };
  });

  app.post("/hq/galaxy/endorse", async (request, reply) => {
    if (!deps.getCurrentSeasonSummary || !deps.authenticateBearer || !deps.endorsementStore || !deps.authBindingStore) {
      reply.code(503);
      return { ok: false, error: "galaxy is unavailable" };
    }
    const identity = await deps.authenticateBearer(bearerHeader(request));
    if (!identity) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    const summary = await deps.getCurrentSeasonSummary();
    const window = currentEmperorWindow(summary);
    if (!window) {
      reply.code(409);
      return { ok: false, error: "no endorsement window is open" };
    }
    if (identity.playerId !== window.emperorPlayerId) {
      reply.code(403);
      return { ok: false, error: "you are not the Emperor" };
    }
    if (now() - window.crownedAt >= IMPERIAL_WARD_ENDORSEMENT_WINDOW_MS) {
      reply.code(409);
      return { ok: false, error: "endorsement window has closed" };
    }
    const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
    const targetAuthUid = typeof body.targetAuthUid === "string" ? body.targetAuthUid.trim() : "";
    const targetEmail = typeof body.targetEmail === "string" ? body.targetEmail.trim() : "";
    if (!targetAuthUid && !targetEmail) {
      reply.code(400);
      return { ok: false, error: "targetAuthUid or targetEmail is required" };
    }
    const binding = targetAuthUid
      ? await deps.authBindingStore.getByUid(targetAuthUid)
      : await deps.authBindingStore.getByEmail(targetEmail);
    if (!binding) {
      reply.code(404);
      return { ok: false, error: "player not found" };
    }
    if (binding.playerId === window.emperorPlayerId) {
      reply.code(400);
      return { ok: false, error: "you cannot endorse yourself" };
    }
    const record = await deps.endorsementStore.upsert({
      endedSeasonId: window.endedSeasonId,
      emperorPlayerId: window.emperorPlayerId,
      targetPlayerId: binding.playerId
    });
    return { ok: true, endorsement: { targetPlayerId: record.targetPlayerId, createdAt: record.createdAt } };
  });
};
