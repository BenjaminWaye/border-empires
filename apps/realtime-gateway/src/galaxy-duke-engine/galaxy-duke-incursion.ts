// Warden incursions (§21.10): a finite regional pool, so each Duke's share is
// 1/(Dukes in the region) incursions per Cycle. The MVP treats the whole galaxy
// as one region. A Court-protected Duke (§21.10 offer) is skipped.
import { isCourtProtected } from "../galaxy-court-offer/galaxy-court-offer.js";
import { INCURSION_WARNING_MS } from "./galaxy-duke-config.js";
import { hitsRemaining, resolveWardenIncursion } from "./galaxy-duke-combat.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import type { DukeEffect, DukeStep } from "./galaxy-duke-production.js";
import type { DukeCounter, DukeState } from "./galaxy-duke-types.js";

// The credit can never bank more than two incursions' worth, so a long-idle
// galaxy cannot release a burst later.
const MAX_CREDIT = 2;

export const creditIncursion = (state: DukeState, dukeCount: number, cycleIndex: number, now: number): DukeStep => {
  if (cycleIndex <= state.incursion.lastCreditCycle || dukeCount < 1) return { state, counters: [], effects: [] };
  const credit = Math.min(MAX_CREDIT, state.incursion.credit + (cycleIndex - state.incursion.lastCreditCycle) / dukeCount);
  let next: DukeState = { ...state, incursion: { ...state.incursion, credit, lastCreditCycle: cycleIndex } };
  const counters: DukeCounter[] = [];
  if (next.incursion.arrivesAt === null && next.incursion.credit >= 1) {
    next = { ...next, incursion: { ...next.incursion, credit: next.incursion.credit - 1, arrivesAt: now + INCURSION_WARNING_MS } };
    const pushed = pushDigest(next, now, "COMBAT", "Unidentified craft detected on approach. Arrival in 3 days.");
    next = pushed.state;
    counters.push(...pushed.counters);
  }
  return { state: next, counters, effects: [] };
};

export type HeldStability = { seasonId: string; label: string; stability: number };

export const landIncursion = (state: DukeState, sectors: ReadonlyArray<HeldStability>, now: number): DukeStep => {
  const arrival = state.incursion.arrivesAt;
  if (arrival === null || now < arrival) return { state, counters: [], effects: [] };
  const cleared: DukeState = { ...state, incursion: { ...state.incursion, arrivesAt: null, count: state.incursion.count + 1 } };
  if (sectors.length === 0) return { state: cleared, counters: [], effects: [] };
  if (isCourtProtected(state.courtOffer, now)) {
    const pushed = pushDigest(cleared, now, "COURT", "Court fleets turned the Wardens back. Your Sector was not touched.");
    return { state: pushed.state, counters: ["duke_incursion_suppressed_by_court", ...pushed.counters], effects: [] };
  }
  const target = sectors[state.incursion.count % sectors.length]!;
  const outcome = resolveWardenIncursion(state.fighters);
  const effects: DukeEffect[] = [];
  let text: string;
  if (outcome.repelled) {
    text = outcome.fighterLost
      ? `Incursion repelled at ${target.label}, but your Fighter was destroyed.`
      : `Incursion repelled at ${target.label}. Fighter hull -${outcome.hullLoss}%.`;
  } else {
    const after = Math.max(0, target.stability - outcome.stabilityLoss);
    effects.push({ kind: "STABILITY_DELTA", seasonId: target.seasonId, delta: -outcome.stabilityLoss });
    text = `Incursion hit ${target.label}: Stability ${target.stability} to ${after}. This Sector can take ${hitsRemaining(after)} more hits like this before it is contested.`;
  }
  const pushed = pushDigest({ ...cleared, fighters: outcome.fighters }, now, "COMBAT", text);
  return { state: pushed.state, counters: pushed.counters, effects };
};
