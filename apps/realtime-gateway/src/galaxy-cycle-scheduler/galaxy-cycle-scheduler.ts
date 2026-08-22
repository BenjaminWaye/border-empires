import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { resolveGalaxyHoldingsByOwner } from "../galaxy-holdings/galaxy-holdings.js";
import { GALAXY_CYCLE_LENGTH_MS, computeGalaxyCycleTick } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";

export type GalaxyCycleSchedulerDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authBindingStore: GatewayAuthBindingStore;
  galaxyEconomyStore: GalaxyEconomyStore;
  now?: () => number;
  // How often the wall-clock timer wakes up to check for elapsed Cycles.
  // Deliberately much shorter than GALAXY_CYCLE_LENGTH_MS itself so a Cycle
  // boundary is never missed by more than this poll interval — the tick
  // computation is cheap (pure in-memory math per empire) so a short poll
  // costs nothing. Defaults to hourly.
  pollIntervalMs?: number;
  onError?: (error: unknown) => void;
};

// Thin wall-clock wiring around the pure computeGalaxyCycleTick (§9/§14):
// wakes up on a poll interval, and for every empire with a ledger row (plus
// any newly-active empire discovered via resolveGalaxyHoldingsByOwner),
// advances however many whole Cycles have elapsed since lastCycleAt and
// persists the result. Mirrors the shape of
// galaxy-endorsement-auto-start.ts's setInterval + inFlight-guard timer and
// gateway-app/recurring-task.ts's startRecurringTask — this repo's existing
// pattern for wall-clock-driven server-side scheduling — rather than
// inventing a new scheduling primitive.
export const startGalaxyCycleScheduler = (deps: GalaxyCycleSchedulerDeps): { stop: () => void } => {
  const now = deps.now ?? (() => Date.now());
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      const holdingsByOwner = await resolveGalaxyHoldingsByOwner({
        listSeasonArchives: deps.listSeasonArchives,
        ...(deps.getCurrentSeasonSummary ? { getCurrentSeasonSummary: deps.getCurrentSeasonSummary } : {}),
        authBindingStore: deps.authBindingStore
      });
      const existingBalances = await deps.galaxyEconomyStore.getAllBalances();
      const authUids = new Set<string>([...holdingsByOwner.keys(), ...existingBalances.map((b) => b.authUid)]);

      const nowMs = now();
      for (const authUid of authUids) {
        const balance = await deps.galaxyEconomyStore.getBalance(authUid);
        const lastCycleAt = balance?.lastCycleAt ?? nowMs;
        const cyclesElapsed = Math.floor((nowMs - lastCycleAt) / GALAXY_CYCLE_LENGTH_MS);
        if (cyclesElapsed <= 0) {
          // No ledger row yet for a newly-discovered empire, but no whole
          // Cycle has elapsed either: seed the row so the next poll has a
          // baseline lastCycleAt to measure from, without granting any
          // trickle for partial time.
          if (!balance) {
            await deps.galaxyEconomyStore.upsertBalance({ authUid, influence: 0, production: 0, lastCycleAt: nowMs });
          }
          continue;
        }

        const territories = holdingsByOwner.get(authUid) ?? [];
        const stabilityByKey = new Map<string, number>();
        for (const territory of territories) {
          const record = await deps.galaxyEconomyStore.ensureStability({ authUid, seasonId: territory.seasonId, tier: territory.tier });
          stabilityByKey.set(territory.seasonId, record.stability);
        }

        const result = computeGalaxyCycleTick(
          {
            influence: balance?.influence ?? 0,
            production: balance?.production ?? 0,
            territories: territories.map((t) => ({ ...t, stability: stabilityByKey.get(t.seasonId) ?? 100 }))
          },
          cyclesElapsed
        );

        await deps.galaxyEconomyStore.upsertBalance({
          authUid,
          influence: result.influence,
          production: result.production,
          lastCycleAt: lastCycleAt + cyclesElapsed * GALAXY_CYCLE_LENGTH_MS
        });
        for (const territory of result.territories) {
          await deps.galaxyEconomyStore.setStability(authUid, territory.seasonId, territory.stability);
        }
      }
    } catch (error) {
      deps.onError?.(error);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), deps.pollIntervalMs ?? 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  void tick();
  return { stop: () => clearInterval(timer) };
};
