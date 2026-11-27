// Wires the next Sector Contest to the gateway's simulation client and
// broadcast path, so gateway-app.ts only passes in what it owns.
import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";
import type { SimulationClientMethods } from "../sim-client/sim-client.js";
import { createNextContest, type NextContest, type NextContestDeps, type NextContestUpdate } from "./next-contest.js";
import { hasReservedPlace, joinWithReservedPlace } from "../season-full-rejection/reserve-next-contest-place.js";

export type GatewayNextContestDeps = {
  simulationClient: Pick<SimulationClientMethods, "getCurrentSeasonSummary" | "startNextSeason" | "joinSeason">;
  store: SectorWaitlistStore;
  singleContest?: boolean;
  onSeasonStarted: (seasonId: string, force: boolean) => void;
  broadcast: (payload: NextContestUpdate) => void;
  recordGatewayEvent: NextContestDeps["recordGatewayEvent"];
};

/**
 * Joins a committed player to the new contest. One who also holds a reserved
 * place (turned away last contest for lack of a landing site) gets past the cap.
 */
export const nextContestJoin = (deps: Pick<GatewayNextContestDeps, "simulationClient" | "store" | "singleContest">): NextContestDeps["joinSeason"] => async (playerId) => {
  const { simulationClient } = deps;
  const joinSeason = simulationClient.joinSeason;
  if (!joinSeason) throw new Error("simulation joinSeason RPC is unavailable");
  return joinWithReservedPlace(
    (reservedPlace) => joinSeason(playerId, undefined, { isGuest: false, ...(reservedPlace ? { reservedPlace: true } : {}) }),
    deps.singleContest ? undefined : () => hasReservedPlace({ store: deps.store, getCurrentSeason: () => simulationClient.getCurrentSeasonSummary() }, playerId)
  );
};

export const createGatewayNextContest = (deps: GatewayNextContestDeps): NextContest => {
  const { simulationClient } = deps;
  return createNextContest({
    store: deps.store,
    ...(deps.singleContest ? { singleContest: true } : {}),
    getCurrentSeason: async () => {
      const { seasonId, status } = await simulationClient.getCurrentSeasonSummary();
      return { seasonId, status };
    },
    startNextSeason: () => simulationClient.startNextSeason(false),
    joinSeason: nextContestJoin(deps),
    onSeasonStarted: deps.onSeasonStarted,
    broadcast: deps.broadcast,
    recordGatewayEvent: deps.recordGatewayEvent
  });
};
