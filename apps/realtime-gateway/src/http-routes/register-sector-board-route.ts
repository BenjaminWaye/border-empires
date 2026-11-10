// GET /sector/board: what the join screen's Sector board shows before a
// player commits to the current Sector Contest -- how many Houses hold it,
// the cap, whether it is full, and how many are waiting for the next one.
// Public and unauthenticated like /hq/summary: every value here is already
// visible to anyone on the leaderboard or the full-Sector screen.
import type { FastifyInstance } from "fastify";

import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";

export type SectorOccupancy = { seasonId: string; status: string; playerIds: readonly string[] };

export type SectorBoardRouteDeps = {
  store: Pick<SectorWaitlistStore, "count">;
  getOccupancy: () => Promise<SectorOccupancy>;
  /** SIMULATION_MAX_SEASON_PLAYERS as the simulation enforces it; 0 = no cap. */
  maxHouses: () => number;
};

export type SectorBoardReply =
  | { ok: true; seasonId: string; status: string; houses: number; maxHouses: number; full: boolean; waitingCount: number }
  | { ok: false; error: string };

// The join cap counts human players only (season-join-capacity.ts), so AI
// empires ("ai-<n>", as worldgen names them) and the barbarian faction
// ("barbarian", "barbarian-<n>") are left out here too. This is an estimate:
// the leaderboard lists only empires that hold land, while the cap also
// counts landless or eliminated humans still on record, so the board reads
// low -- more so late in a contest -- and never high. The join itself stays
// authoritative: a refused join opens the next-Sector waitlist.
const AI_ID = /^ai-\d+$/;
const BARBARIAN_ID = /^barbarian(-\d+)?$/;
const isHumanHouse = (playerId: string): boolean => !AI_ID.test(playerId) && !BARBARIAN_ID.test(playerId);

export const countHumanHouses = (playerIds: readonly string[]): number => playerIds.filter(isHumanHouse).length;

export const registerSectorBoardRoute = (app: FastifyInstance, deps: SectorBoardRouteDeps): void => {
  app.get("/sector/board", async (_request, reply): Promise<SectorBoardReply> => {
    let occupancy: SectorOccupancy;
    let waitingCount: number;
    try {
      occupancy = await deps.getOccupancy();
      waitingCount = await deps.store.count(occupancy.seasonId);
    } catch {
      reply.code(503);
      return { ok: false, error: "season unavailable" };
    }
    const houses = countHumanHouses(occupancy.playerIds);
    const maxHouses = Math.max(0, deps.maxHouses());
    return {
      ok: true,
      seasonId: occupancy.seasonId,
      status: occupancy.status,
      houses,
      maxHouses,
      full: maxHouses > 0 && houses >= maxHouses,
      waitingCount
    };
  });
};
