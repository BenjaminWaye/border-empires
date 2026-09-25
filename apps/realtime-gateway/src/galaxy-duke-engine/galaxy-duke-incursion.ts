// Warden incursions (§21.10): a finite regional pool, split across every Planet
// in the galaxy, so a lone Planet takes the whole pool and each extra Planet
// eases everyone's share. They are hardest at the start. Each system keeps its
// own credit, so a Duke with more Planets is attacked more. A Court-protected
// Duke (§21.10 offer) is skipped.
import { isCourtProtected } from "../galaxy-court-offer/galaxy-court-offer.js";
import { CYCLE_DAYS, INCURSION_WARNING_MS, MAX_INCURSION_CREDIT, WARDEN_POOL_PER_CYCLE } from "./galaxy-duke-config.js";
import { hitsRemaining, resolveWardenIncursion } from "./galaxy-duke-combat.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import type { DukeEffect, DukeStep } from "./galaxy-duke-production.js";
import { replaceSystem } from "./galaxy-duke-systems.js";
import type { DukeCounter, DukeState } from "./galaxy-duke-types.js";

const CYCLE_MS = CYCLE_DAYS * 24 * 60 * 60 * 1000;

export type SectorView = { label: string; stability: number };

// Incursions per Cycle each Planet takes: the pool divided by all Planets.
export const incursionRatePerCycle = (totalPlanets: number): number => WARDEN_POOL_PER_CYCLE / Math.max(1, totalPlanets);

// Accrues credit by elapsed time and announces an incursion (24 hours out) at 1.
export const accrueIncursions = (
  state: DukeState,
  totalPlanets: number,
  labels: ReadonlyMap<string, string>,
  now: number
): DukeStep => {
  const rate = incursionRatePerCycle(totalPlanets);
  let next = state;
  const counters: DukeCounter[] = [];
  for (const system of state.systems) {
    const elapsed = Math.max(0, now - system.incursion.lastCreditAt);
    let credit = Math.min(MAX_INCURSION_CREDIT, system.incursion.credit + (elapsed / CYCLE_MS) * rate);
    let arrivesAt = system.incursion.arrivesAt;
    let announced = false;
    if (arrivesAt === null && credit >= 1) {
      credit -= 1;
      arrivesAt = now + INCURSION_WARNING_MS;
      announced = true;
    }
    next = replaceSystem(next, { ...system, incursion: { ...system.incursion, credit, arrivesAt, lastCreditAt: now } });
    if (announced) {
      const pushed = pushDigest(next, now, "COMBAT", `Unidentified craft detected near ${labels.get(system.seasonId) ?? "your system"}. Arrival in 24 hours.`);
      next = pushed.state;
      counters.push(...pushed.counters);
    }
  }
  return { state: next, counters, effects: [] };
};

// Lands every incursion whose arrival time has passed.
export const landIncursions = (state: DukeState, sectors: ReadonlyMap<string, SectorView>, now: number): DukeStep => {
  let next = state;
  const counters: DukeCounter[] = [];
  const effects: DukeEffect[] = [];
  for (const system of state.systems) {
    const arrival = system.incursion.arrivesAt;
    if (arrival === null || now < arrival) continue;
    const sector = sectors.get(system.seasonId);
    const cleared = { ...system, incursion: { ...system.incursion, arrivesAt: null, count: system.incursion.count + 1 } };
    if (!sector) {
      next = replaceSystem(next, cleared);
      continue;
    }
    if (isCourtProtected(state.courtOffer, now)) {
      const pushed = pushDigest(replaceSystem(next, cleared), now, "COURT", `Court fleets turned the Wardens back from ${sector.label}. Nothing was touched.`);
      next = pushed.state;
      counters.push("duke_incursion_suppressed_by_court", ...pushed.counters);
      continue;
    }
    const outcome = resolveWardenIncursion(system.fighters);
    let text: string;
    if (outcome.repelled) {
      text = outcome.fighterLost
        ? `Incursion repelled at ${sector.label}, but your Fighter was destroyed.`
        : `Incursion repelled at ${sector.label}. Fighter hull -${outcome.hullLoss}%.`;
    } else {
      const after = Math.max(0, sector.stability - outcome.stabilityLoss);
      effects.push({ kind: "STABILITY_DELTA", seasonId: system.seasonId, delta: -outcome.stabilityLoss });
      text = `Incursion hit ${sector.label}: Stability ${sector.stability} to ${after}. This Sector can take ${hitsRemaining(after)} more hits like this before it is contested.`;
    }
    const pushed = pushDigest(replaceSystem(next, { ...cleared, fighters: outcome.fighters }), now, "COMBAT", text);
    next = pushed.state;
    counters.push(...pushed.counters);
  }
  return { state: next, counters, effects };
};
