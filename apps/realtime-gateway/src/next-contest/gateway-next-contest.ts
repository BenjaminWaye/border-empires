// Wires the next Sector Contest to the gateway's simulation client and
// broadcast path, so gateway-app.ts only passes in what it owns.
import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";
import type { SimulationClientMethods } from "../sim-client/sim-client.js";
import { createNextContest, type NextContest, type NextContestDeps, type NextContestUpdate } from "./next-contest.js";

export type GatewayNextContestDeps = {
  simulationClient: Pick<SimulationClientMethods, "getCurrentSeasonSummary" | "startNextSeason" | "joinSeason">;
  store: SectorWaitlistStore;
  onSeasonStarted: (seasonId: string, force: boolean) => void;
  broadcast: (payload: NextContestUpdate) => void;
  recordGatewayEvent: NextContestDeps["recordGatewayEvent"];
};

export const createGatewayNextContest = (deps: GatewayNextContestDeps): NextContest => {
  const { simulationClient } = deps;
  return createNextContest({
    store: deps.store,
    getCurrentSeason: async () => {
      const { seasonId, status } = await simulationClient.getCurrentSeasonSummary();
      return { seasonId, status };
    },
    startNextSeason: () => simulationClient.startNextSeason(false),
    joinSeason: async (playerId) => {
      if (!simulationClient.joinSeason) throw new Error("simulation joinSeason RPC is unavailable");
      return simulationClient.joinSeason(playerId, undefined, { isGuest: false });
    },
    onSeasonStarted: deps.onSeasonStarted,
    broadcast: deps.broadcast,
    recordGatewayEvent: deps.recordGatewayEvent
  });
};
