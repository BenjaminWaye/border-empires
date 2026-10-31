// Court Favor (the Blind Eye, §21.6) and Writs of Advancement (§21.3). Pure:
// the service supplies Domain Weight ranks and Court Strength.
import { HULL_MAX, MAX_FIGHTERS_PER_SYSTEM, MAX_FLIGHTS, FIGHTER_TRAVEL_MS } from "./galaxy-duke-config.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import {
  BLIND_EYE_LEAD_RATIO,
  BLIND_EYE_SUSTAIN_MS,
  WRIT_BASE_CHANCE_PERCENT,
  WRIT_OFFER_MS,
  WRIT_TOP_HALF_BONUS_PERCENT,
  WRIT_WEAKNESS_CHANCE_PERCENT
} from "./galaxy-duke-politics-config.js";
import { fightersOwned } from "./galaxy-duke-production.js";
import { replaceSystem } from "./galaxy-duke-systems.js";
import type { CourtFavor, DukeCounter, DukeState, WritOffer } from "./galaxy-duke-types.js";

export const favorOf = (state: DukeState): CourtFavor => state.favor ?? { leadSince: null, revoked: false, lastDrainCycle: -1 };

// True when `weight` is far enough ahead of second place to draw the Court's eye.
export const isRunaway = (weight: number, secondWeight: number | null): boolean =>
  secondWeight !== null && weight > 0 && weight >= BLIND_EYE_LEAD_RATIO * Math.max(secondWeight, 1);

// Advances one Duke's Court Favor given whether they are a runaway right now.
export const updateFavor = (state: DukeState, runaway: boolean, now: number): { state: DukeState; counters: DukeCounter[] } => {
  const favor = favorOf(state);
  if (!runaway) {
    if (!favor.revoked && favor.leadSince === null) return { state, counters: [] };
    const next = { ...state, favor: { ...favor, leadSince: null, revoked: false } };
    return favor.revoked ? pushDigest(next, now, "COURT", "Your lead has narrowed. The Court's Favor is restored.") : { state: next, counters: [] };
  }
  const leadSince = favor.leadSince ?? now;
  const revoked = now - leadSince >= BLIND_EYE_SUSTAIN_MS;
  const next = { ...state, favor: { ...favor, leadSince, revoked } };
  if (revoked && !favor.revoked) {
    const text =
      "The Court has turned a blind eye to you: your lead is too large. Your weakest Sector loses Stability each Cycle, the Court's protection no longer covers you, and rivals may declare grievances against you for free. Lend a Fighter to the Court to win back its Favor.";
    return pushDigest(next, now, "COURT", text);
  }
  return { state: next, counters: [] };
};

// Lending a Fighter resets the sustain clock and restores Favor (§21.6).
export const resetFavorClock = (state: DukeState, now: number): DukeState => ({
  ...state,
  favor: { ...favorOf(state), leadSince: now, revoked: false }
});

const hash = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// Percent chance this Cycle: rises as the Court weakens and for the top half.
export const writChancePercent = (courtCurrent: number, courtStart: number, topHalf: boolean): number => {
  const weakness = courtStart > 0 ? 1 - courtCurrent / courtStart : 0;
  return Math.round(WRIT_BASE_CHANCE_PERCENT + WRIT_WEAKNESS_CHANCE_PERCENT * Math.max(0, weakness) + (topHalf ? WRIT_TOP_HALF_BONUS_PERCENT : 0));
};

export type WritRival = { authUid: string; seasonId: string };

// Rolls (deterministically, once per Cycle) whether the Court offers this Duke
// a Writ. A STRIKE needs a rival; without one the offer is a FIGHTER.
export const maybeOfferWrit = (
  state: DukeState,
  input: { cycleIndex: number; chancePercent: number; rival: WritRival | null; now: number }
): { state: DukeState; offered: boolean } => {
  const writ = state.writ ?? { offer: null, lastOfferCycle: -1 };
  if (writ.offer && input.now < writ.offer.expiresAt) return { state, offered: false };
  if (writ.lastOfferCycle === input.cycleIndex) return { state: writ.offer ? { ...state, writ: { ...writ, offer: null } } : state, offered: false };
  const roll = hash(`${state.authUid}:writ:${input.cycleIndex}`);
  const base = { ...state, writ: { offer: null, lastOfferCycle: input.cycleIndex } };
  if (roll % 100 >= input.chancePercent) return { state: base, offered: false };
  const expiresAt = input.now + WRIT_OFFER_MS;
  const offer: WritOffer =
    input.rival && (roll >>> 8) & 1
      ? { kind: "STRIKE", offeredAt: input.now, expiresAt, targetAuthUid: input.rival.authUid, targetSeasonId: input.rival.seasonId }
      : { kind: "FIGHTER", offeredAt: input.now, expiresAt };
  return { state: { ...base, writ: { offer, lastOfferCycle: input.cycleIndex } }, offered: true };
};

export const pendingWrit = (state: DukeState, now: number): WritOffer | null => {
  const offer = state.writ?.offer ?? null;
  return offer && now < offer.expiresAt ? offer : null;
};

export type WritErrorCode = "NO_PENDING_WRIT" | "NO_ROOM" | "TOO_MANY_FLIGHTS";
export type WritResult = { ok: true; state: DukeState; accepted: boolean } | { ok: false; code: WritErrorCode };

// Taking or refusing is free and private (§21.3). Taking a FIGHTER puts a full
// Fighter in the system with the fewest; a STRIKE launches a Court Fighter at
// the named rival from this Duke's first system.
export const answerWrit = (state: DukeState, accept: boolean, now: number): WritResult => {
  const offer = pendingWrit(state, now);
  if (!offer) return { ok: false, code: "NO_PENDING_WRIT" };
  const cleared: DukeState = { ...state, writ: { offer: null, lastOfferCycle: state.writ?.lastOfferCycle ?? -1 } };
  if (!accept) return { ok: true, state: cleared, accepted: false };
  if (offer.kind === "FIGHTER") {
    // Fighters away on raids or lent to the Court keep their berth (planBuild's rule).
    const target = [...cleared.systems].sort((a, b) => fightersOwned(cleared, a) - fightersOwned(cleared, b))[0];
    if (!target || fightersOwned(cleared, target) >= MAX_FIGHTERS_PER_SYSTEM) return { ok: false, code: "NO_ROOM" };
    return { ok: true, state: replaceSystem(cleared, { ...target, fighters: [...target.fighters, { hull: HULL_MAX }] }), accepted: true };
  }
  const home = cleared.systems[0];
  if (!home) return { ok: false, code: "NO_ROOM" };
  if (cleared.flights.length >= MAX_FLIGHTS) return { ok: false, code: "TOO_MANY_FLIGHTS" };
  const flight = {
    kind: "RAID" as const,
    fromSeasonId: home.seasonId,
    seasonId: offer.targetSeasonId,
    launchedAt: now,
    arrivesAt: now + FIGHTER_TRAVEL_MS,
    fighterHull: HULL_MAX,
    courtWrit: true
  };
  return { ok: true, state: { ...cleared, flights: [...cleared.flights, flight] }, accepted: true };
};
