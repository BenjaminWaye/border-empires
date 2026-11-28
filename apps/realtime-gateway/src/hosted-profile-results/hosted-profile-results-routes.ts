// POST /admin/hosted-results/record: the hosting service reports a hosted
// sector's results after saving them (apps/sector-control, plan step 8d), so
// each member's profile can show them (owner decision Q4). Behind
// HOSTING_SERVICE_TOKEN only (hosting-service-auth.ts).
//
// Body: { sectorId, endedAt, finished, houses, standings: [{ uid, rank }] }.
// Standings name members by Firebase uid; each is resolved to this gateway's
// player id. A uid with no account here is skipped and counted.
import type { FastifyInstance } from "fastify";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { assertHostingServiceToken, hostingServiceAuthorized } from "../hosting-service-auth/hosting-service-auth.js";
import type { HostedProfileResult, HostedProfileResultsStore } from "./hosted-profile-results-store.js";

/** A sector holds at most a few dozen human places. */
const MAX_STANDINGS = 200;
const SECTOR_ID = /^s-[a-z0-9]{1,64}$/;

const wholeNumber = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;

export const registerHostedProfileResultsRoutes = (
  app: FastifyInstance,
  deps: { token: string; authBindingStore: Pick<GatewayAuthBindingStore, "getByUid">; store: HostedProfileResultsStore; onRecorded?: (playerIds: string[]) => void }
): void => {
  assertHostingServiceToken(deps.token);
  app.post("/admin/hosted-results/record", async (request, reply) => {
    if (!hostingServiceAuthorized(request.headers.authorization, deps.token)) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const sectorId = typeof body.sectorId === "string" && SECTOR_ID.test(body.sectorId) ? body.sectorId : undefined;
    const endedAt = wholeNumber(body.endedAt, 0, Number.MAX_SAFE_INTEGER);
    const houses = wholeNumber(body.houses, 1, 10_000);
    const standings = Array.isArray(body.standings) ? body.standings : undefined;
    if (!sectorId || endedAt === undefined || houses === undefined || typeof body.finished !== "boolean" || !standings || standings.length > MAX_STANDINGS) {
      return reply.code(400).send({ ok: false, error: "sectorId, endedAt, finished, houses and standings are required" });
    }
    const results: HostedProfileResult[] = [];
    let unknown = 0;
    for (const entry of standings) {
      const { uid, rank } = (entry ?? {}) as Record<string, unknown>;
      const place = wholeNumber(rank, 1, houses);
      if (typeof uid !== "string" || !uid || place === undefined) return reply.code(400).send({ ok: false, error: "each standing needs a uid and a rank" });
      const binding = await deps.authBindingStore.getByUid(uid);
      if (!binding) {
        unknown += 1;
        continue;
      }
      results.push({ playerId: binding.playerId, sectorId, endedAt, finished: body.finished, rank: place, houses });
    }
    await deps.store.record(results);
    deps.onRecorded?.(results.map((result) => result.playerId));
    return { ok: true, recorded: results.length, unknown };
  });
};
