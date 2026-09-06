import type { GalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxyFleetOrder, GalaxyFleetStore } from "../galaxy-fleet-store/galaxy-fleet-store.js";
import { resolveFleetRaid } from "../galaxy-fleet-tick/galaxy-fleet-tick.js";

export type GalaxyFleetSchedulerDeps = {
  galaxyFleetStore: GalaxyFleetStore;
  galaxyEconomyStore: GalaxyEconomyStore;
  galaxyBattleLogStore: GalaxyBattleLogStore;
  // Optional (§7/§11): when wired, a raid that breaks a Sector's Stability
  // to 0 also enqueues it for a Defense Campaign, same as a passed Senate
  // CONTEST (galaxy-senate-scheduler.ts). Omitted just means the Sector
  // sits at 0 Stability with no season-creation consequence yet -- same
  // degraded-but-safe behavior CONTEST already has without this store.
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore;
  now?: () => number;
  pollIntervalMs?: number;
  onError?: (error: unknown) => void;
};

// Thin wall-clock wiring around the pure resolveFleetRaid (galaxy-fleet-
// tick.ts), mirroring galaxy-senate-scheduler.ts's shape: wake on a poll
// interval, resolve every TRAVELING order whose arrivesAt has passed,
// apply the raid's effect to the target's Stability/Garrison, post to the
// public battle log (§7), and enqueue a Defense Campaign on a Sector that
// just broke.
export const startGalaxyFleetScheduler = (deps: GalaxyFleetSchedulerDeps): { stop: () => void } => {
  const now = deps.now ?? (() => Date.now());
  let inFlight = false;

  const resolveOne = async (order: GalaxyFleetOrder): Promise<void> => {
    const territory = await deps.galaxyEconomyStore.getStability(order.targetAuthUid, order.targetSeasonId);
    // The target territory no longer exists (already lost, transferred, or
    // never had a Stability row) -- nothing left to raid. Resolve the
    // order as a no-op rather than leaving it stuck TRAVELING forever.
    const outcome = resolveFleetRaid({
      composition: order.composition,
      garrisonProduction: territory?.garrison ?? 0,
      currentStability: territory?.stability ?? 0
    });

    if (territory && !outcome.reconOnly) {
      await deps.galaxyEconomyStore.setStability(order.targetAuthUid, order.targetSeasonId, outcome.stabilityAfter);
      if (outcome.stabilityAfter === 0) {
        await deps.galaxyEconomyStore.resetGarrison(order.targetAuthUid, order.targetSeasonId);
        await deps.galaxyDefenseCampaignStore?.enqueueContested({
          targetSeasonId: order.targetSeasonId,
          targetAuthUid: order.targetAuthUid,
          queuedAt: now()
        });
      }
    }

    await deps.galaxyBattleLogStore.recordRaid({
      attackerAuthUid: order.ownerAuthUid,
      defenderAuthUid: order.targetAuthUid,
      targetSeasonId: order.targetSeasonId,
      reconOnly: outcome.reconOnly,
      damageDealt: outcome.damageDealt,
      netDamage: outcome.netDamage,
      stabilityAfter: outcome.stabilityAfter,
      resolvedAt: now()
    });

    await deps.galaxyFleetStore.resolveOrder(order.id, { resolvedAt: now(), outcome });
  };

  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      const arrived = await deps.galaxyFleetStore.getArrivedTravelingOrders(now());
      for (const order of arrived) await resolveOne(order);
    } catch (error) {
      deps.onError?.(error);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), deps.pollIntervalMs ?? 60_000);
  if (typeof timer.unref === "function") timer.unref();
  void tick();
  return { stop: () => clearInterval(timer) };
};
