// Shared test harness for the Duke service: in-memory stores, an archive list
// of won seasons, and a clock the test drives. Test-only.
import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import { InMemoryGalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import { findSystem, replaceSystem } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { InMemoryGalaxyDukeStore } from "../galaxy-duke-store/galaxy-duke-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import { InMemoryGalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import { createGalaxyDukeService } from "./galaxy-duke-service.js";

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const T0 = 100 * GALAXY_CYCLE_LENGTH_MS;

// `player` "ai-<n>" is a seasonal AI empire: it has no account binding.
export type Won = { seasonId: string; player: "a" | "b" | "x" | `ai-${number}`; objective?: "TOWN_CONTROL" | "DIPLOMATIC_DOMINANCE" };
const archive = (won: Won, sequence: number): SeasonArchiveRow => ({
  seasonId: won.seasonId,
  seasonSequence: sequence,
  endedAt: 1_000,
  updatedAt: 1_000,
  mostTerritory: [],
  mostPoints: [],
  longestSurvivalMs: [],
  replayEvents: [],
  winner: { playerId: won.player.startsWith("ai-") ? won.player : `player-${won.player}`, playerName: won.player, objectiveId: won.objective ?? "TOWN_CONTROL", objectiveName: "x", crownedAt: 1 }
});

export const harness = async (planets: Won[] = [{ seasonId: "season-a", player: "a" }, { seasonId: "season-b", player: "b", objective: "DIPLOMATIC_DOMINANCE" }]) => {
  let nowMs = T0;
  const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
  for (const p of ["a", "b", "x"]) await authBindingStore.bindIdentity({ uid: `uid-${p}`, playerId: `player-${p}` });
  const stores = {
    dukeStore: new InMemoryGalaxyDukeStore(),
    galaxyEconomyStore: new InMemoryGalaxyEconomyStore(),
    galaxyBattleLogStore: new InMemoryGalaxyBattleLogStore(),
    galaxyDefenseCampaignStore: new InMemoryGalaxyDefenseCampaignStore(),
    galaxyExplorationStore: new InMemoryGalaxyExplorationStore(),
    galaxyPlanetStore: new InMemoryGalaxyPlanetStore()
  };
  const counters: string[] = [];
  const service = createGalaxyDukeService({
    ...stores,
    authBindingStore,
    listSeasonArchives: async () => planets.map((p, i) => archive(p, i + 1)),
    now: () => nowMs,
    onCounter: (c) => counters.push(c)
  });
  const h = {
    service,
    stores,
    counters,
    advance: (ms: number) => {
      nowMs += ms;
    },
    // Steps the clock in hourly ticks, like the real scheduler.
    run: async (ms: number) => {
      for (let t = 0; t < ms; t += HOUR) {
        nowMs += Math.min(HOUR, ms - t);
        await service.tick();
      }
    },
    stability: async (uid: string, seasonId: string) => (await stores.galaxyEconomyStore.getStability(uid, seasonId))?.stability,
    patch: async (uid: string, fn: (s: DukeState) => DukeState) => {
      const state = await stores.dukeStore.get(uid);
      await stores.dukeStore.put(fn(state!));
    }
  };
  return h;
};

export const withSystem = (seasonId: string, patch: Partial<ReturnType<typeof findSystem> & object>) => (s: DukeState): DukeState =>
  replaceSystem(s, { ...findSystem(s, seasonId)!, ...patch });
