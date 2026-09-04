import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import type { GalaxySenateProposal, GalaxySenateStore } from "../galaxy-senate-store/galaxy-senate-store.js";
import type { GalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { resolveGalaxyDominionWeights } from "../galaxy-dominion-weight/galaxy-dominion-weight.js";
import { GALAXY_SENATE_ACTIONS, currentGlobalCycleIndex, resolveSenateProposal } from "../galaxy-senate-tick/galaxy-senate-tick.js";

export type GalaxySenateSchedulerDeps = {
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getCurrentSeasonSummary?: () => Promise<CurrentSeasonSummary>;
  authBindingStore: GatewayAuthBindingStore;
  galaxyEconomyStore: GalaxyEconomyStore;
  galaxySenateStore: GalaxySenateStore;
  // Optional (§7/§11): when wired, a passed CONTEST also enqueues its target
  // territory for an eventual Defense Campaign season, not just zeroing its
  // Stability. Omitted entirely in a deployment that hasn't wired Defense
  // Campaign scheduling yet -- CONTEST still zeroes Stability either way.
  galaxyDefenseCampaignStore?: GalaxyDefenseCampaignStore;
  now?: () => number;
  // Mirrors galaxy-cycle-scheduler.ts's poll interval default (hourly) --
  // resolution only actually fires once the global Cycle index advances
  // past a proposal's createdAtCycleIndex, so a short poll just means a
  // Cycle boundary is never missed by much, not that anything resolves early.
  pollIntervalMs?: number;
  onError?: (error: unknown) => void;
};

// Thin wall-clock wiring around the pure resolveSenateProposal/
// computeDominionVoteWeight (galaxy-senate-tick.ts), mirroring
// galaxy-cycle-scheduler.ts's shape: wake on a poll interval, resolve every
// PENDING proposal whose Cycle window has closed, apply CONTEST's effect
// (forces the named territory's Stability to 0) and stamp EMBARGO's active
// window on a pass. Kept as its own scheduler rather than folded into
// galaxy-cycle-scheduler's per-empire loop, since proposal resolution is
// galaxy-wide (needs every empire's weight, once), not per-empire.
export const startGalaxySenateScheduler = (deps: GalaxySenateSchedulerDeps): { stop: () => void } => {
  const now = deps.now ?? (() => Date.now());
  let inFlight = false;

  const applyPassedEffect = async (
    proposal: GalaxySenateProposal,
    resolvedAtCycleIndex: number,
    resolvedAtMs: number
  ): Promise<{ activeUntilCycleIndex?: number }> => {
    if (proposal.type === "CONTEST") {
      // §7: a passed Contest forces the named territory's Stability to 0
      // regardless of its current health, and (§11) enqueues it for an
      // eventual Defense Campaign season -- the queue is what the
      // galaxy-defense-campaign-scheduler's rollover hook consults to decide
      // the next season's target.
      if (proposal.targetSeasonId) {
        await deps.galaxyEconomyStore.setStability(proposal.targetAuthUid, proposal.targetSeasonId, 0);
        await deps.galaxyDefenseCampaignStore?.enqueueContested({
          targetSeasonId: proposal.targetSeasonId,
          targetAuthUid: proposal.targetAuthUid,
          queuedAt: resolvedAtMs
        });
      }
      return {};
    }
    // EMBARGO: stays active for its configured duration from the Cycle it resolved in.
    const durationCycles = GALAXY_SENATE_ACTIONS.EMBARGO.durationCycles ?? 0;
    return { activeUntilCycleIndex: resolvedAtCycleIndex + durationCycles };
  };

  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      const nowMs = now();
      const currentCycleIndex = currentGlobalCycleIndex(nowMs);
      const pending = await deps.galaxySenateStore.getPendingProposals();
      const eligible = pending.filter((p) => p.createdAtCycleIndex < currentCycleIndex);
      if (eligible.length === 0) return;

      const weightByAuthUid = await resolveGalaxyDominionWeights(deps);
      const total = [...weightByAuthUid.values()].reduce((sum, w) => sum + w, 0);
      for (const proposal of eligible) {
        const votes = await deps.galaxySenateStore.getVotesForProposal(proposal.id);
        const result = resolveSenateProposal(proposal.type, votes, total);
        const effect = result.status === "PASSED" ? await applyPassedEffect(proposal, currentCycleIndex, nowMs) : {};
        await deps.galaxySenateStore.resolveProposal(proposal.id, {
          status: result.status,
          resolvedAt: nowMs,
          ...effect
        });
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
