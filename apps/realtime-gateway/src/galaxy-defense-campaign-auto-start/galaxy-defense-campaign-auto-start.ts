import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

// How long after a season ends before this timer starts the next one.
export const SEASON_AUTO_START_DELAY_MS = 60 * 60_000;

export type GalaxyDefenseCampaignAutoStartDeps = {
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  startNextSeason: (force?: boolean, defenseCampaignTargetSeasonId?: string) => Promise<{ seasonId: string }>;
  // Optional (§7/§11 Defense Campaign auto-scheduling): all three of these
  // must be present together to enable it -- a deployment missing any one
  // just keeps today's behavior (next season is always Frontier).
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore;
  galaxyEconomyStore?: GalaxyEconomyStore;
  authBindingStore?: GatewayAuthBindingStore;
  now?: () => number;
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

// §11's "every third campaign slot reserved for Frontier": derived purely
// from the next season's own sequence number rather than a separately
// tracked counter -- seasonSequence already increments by exactly 1 per
// season, so it's a free, stateless way to get the same guarantee.
const isReservedFrontierSlot = (nextSeasonSequence: number): boolean => nextSeasonSequence % 3 === 0;

// NOT wired into gateway-app.ts: season rollover only happens via the
// START_NEW_SEASON vote (gateway-app.no-auto-season-start.regression.test.ts).
// Once a season has been ended for SEASON_AUTO_START_DELAY_MS, this starts the
// next one. It is the hook point for Defense Campaign auto-scheduling (§7/§11):
// this is the one place in the gateway that decides "what season starts
// next" on the natural end-of-season path, so it's where (a) a just-ended
// Defense Campaign's ownership transfer gets applied, and (b) the next
// season's target gets chosen from the contested queue. A second, separate
// timer racing this one to call startNextSeason would risk a double
// rollover attempt, so this logic is added here rather than as its own
// competing scheduler.
export const startDefenseCampaignAutoStartTimer = (deps: GalaxyDefenseCampaignAutoStartDeps): { stop: () => void } => {
  const now = deps.now ?? (() => Date.now());
  let inFlight = false;

  const defenseCampaignEnabled = Boolean(deps.galaxyDefenseCampaignStore && deps.galaxyEconomyStore && deps.authBindingStore);

  // Applies the ownership transfer for a just-ended Defense Campaign season,
  // if `summary` was tagged as one. A no-op (not an error) if the winner has
  // no bound account -- same "unclaimed frontier" handling every other
  // galaxy award path uses.
  const applyDefenseCampaignTransferIfAny = async (summary: CurrentSeasonSummary): Promise<void> => {
    if (!defenseCampaignEnabled || !summary.defenseCampaignTargetSeasonId || !summary.seasonWinner) return;
    const winnerBinding = await deps.authBindingStore!.getByPlayerId(summary.seasonWinner.playerId);
    if (!winnerBinding?.uid) return;
    await deps.galaxyDefenseCampaignStore!.recordTransfer({
      originalSeasonId: summary.defenseCampaignTargetSeasonId,
      currentOwnerAuthUid: winnerBinding.uid,
      transferredAt: now(),
      wonViaSeasonId: summary.seasonId
    });
    // Seeds a fresh Stability row at 100 for the new owner -- ensureStability
    // is idempotent/creates-if-missing, and this is always a first-time
    // (authUid, seasonId) pair for the new owner, so it always seeds rather
    // than reading back a stale value.
    await deps.galaxyEconomyStore!.ensureStability({ authUid: winnerBinding.uid, seasonId: summary.defenseCampaignTargetSeasonId, tier: "PLANET" });
  };

  // Picks the next season's Defense Campaign target, if any, per §11's
  // policy. Returns undefined on a reserved Frontier slot or an empty queue.
  // Returns the full popped entry (not just the seasonId) so a compensating
  // re-enqueue on startNextSeason failure can restore it exactly.
  const pickNextDefenseCampaignTarget = async (nextSeasonSequence: number) => {
    if (!defenseCampaignEnabled || isReservedFrontierSlot(nextSeasonSequence)) return undefined;
    return deps.galaxyDefenseCampaignStore!.popOldestContested();
  };

  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      const summary = await deps.getCurrentSeasonSummary();
      const deadlineAnchor = summary.seasonWinner?.crownedAt ?? summary.endedAt;
      if (summary.status !== "ended" || typeof deadlineAnchor !== "number") return;
      if (now() - deadlineAnchor < SEASON_AUTO_START_DELAY_MS) return;

      // Isolated from the rest of the tick: a failure applying a Defense
      // Campaign's ownership transfer must not block the season rollover
      // that already ran unconditionally before this feature existed --
      // the transfer is safely retried on read (still visible off
      // getTransferForSeasonId next tick since it isn't recorded here on
      // failure), while blocking the whole tick would stall season
      // progression on an unrelated, ancillary write.
      try {
        await applyDefenseCampaignTransferIfAny(summary);
      } catch (error) {
        deps.onError?.(error);
      }

      const defenseCampaignTarget = await pickNextDefenseCampaignTarget(summary.seasonSequence + 1);
      try {
        await deps.startNextSeason(false, defenseCampaignTarget?.targetSeasonId);
      } catch (error) {
        // Compensate: startNextSeason failing after we already popped a
        // contested territory off the queue would otherwise lose it forever
        // (the pop is destructive) -- put it back exactly as it was so the
        // next tick can try again instead of silently dropping it or losing
        // its original targetAuthUid.
        if (defenseCampaignTarget) {
          await deps.galaxyDefenseCampaignStore!.enqueueContested({
            targetSeasonId: defenseCampaignTarget.targetSeasonId,
            targetAuthUid: defenseCampaignTarget.targetAuthUid,
            queuedAt: now()
          });
        }
        throw error;
      }
    } catch (error) {
      deps.onError?.(error);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), deps.intervalMs ?? 60_000);
  if (typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer) };
};
