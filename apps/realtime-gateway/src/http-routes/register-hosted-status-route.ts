// What the hosting service asks a hosted sector's server about itself
// (docs/hosted-sectors-plan.md, section 9): when a human last visited, so a
// sector nobody plays is closed after 7 days. Whether the contest has ended
// comes from the public /hq/summary.
//
// Registered only on a hosted sector, behind the sector's admin token.
import type { FastifyInstance } from "fastify";

export type HostedStatusRouteDeps = {
  adminAuthorized: (authorization: string | undefined) => boolean;
  /**
   * The latest time any human player was seen, from the persisted player
   * funnel (AI Houses are not recorded there), or undefined if none has come.
   * It survives restarts, which matters: a lost value would read as "never
   * visited" and close a sector that is being played.
   */
  lastHumanVisitAt: () => Promise<number | undefined>;
};

export const registerHostedStatusRoute = (app: FastifyInstance, deps: HostedStatusRouteDeps): void => {
  app.get("/admin/hosted/status", async (request, reply) => {
    const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
    if (!deps.adminAuthorized(authorization)) return reply.code(401).send({ ok: false, error: "unauthorized" });
    try {
      const lastHumanVisitAt = await deps.lastHumanVisitAt();
      return { ok: true, ...(lastHumanVisitAt !== undefined ? { lastHumanVisitAt } : {}) };
    } catch (error) {
      return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : "status unavailable" });
    }
  });
};

/** Latest lastSeenAt across the funnel's rows, which hold human players only. */
export const latestHumanVisit = (rows: ReadonlyArray<{ lastSeenAt: number }>): number | undefined =>
  rows.reduce<number | undefined>((latest, row) => (latest === undefined || row.lastSeenAt > latest ? row.lastSeenAt : latest), undefined);

export const hostedStatusFromFunnel = (store: { listPlayers: () => Promise<ReadonlyArray<{ lastSeenAt: number }>> }): { lastHumanVisitAt: () => Promise<number | undefined> } => ({
  lastHumanVisitAt: async () => latestHumanVisit(await store.listPlayers())
});
