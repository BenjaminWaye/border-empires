import type { FastifyInstance } from "fastify";
import type { LastContestRecapResponse, SeasonArchiveRow } from "@border-empires/sim-protocol";

export const LAST_CONTEST_RECAP_PATH = "/seasons/last-recap";

export type LastContestRecapRouteDeps = {
  // Newest first, display names already hydrated (build-http-routes-deps.ts).
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
};

// Public, like /hq/archives: the recap is the same for every viewer (the
// client highlights "you" itself), so no bearer identity is needed. Drops
// replayEvents, which the overlay never shows.
export const registerLastContestRecapRoute = (app: FastifyInstance, deps: LastContestRecapRouteDeps): void => {
  app.get(LAST_CONTEST_RECAP_PATH, async (_request, reply): Promise<LastContestRecapResponse> => {
    reply.header("Cache-Control", "no-store");
    try {
      const [latest] = await deps.listSeasonArchives();
      if (!latest) return { ok: true, recap: null };
      const { replayEvents: _replayEvents, ...recap } = latest;
      return { ok: true, recap };
    } catch (error) {
      reply.code(503);
      return { ok: false, error: error instanceof Error ? error.message : "failed to load last contest recap" };
    }
  });
};
