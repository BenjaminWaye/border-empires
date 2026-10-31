// Grievances and lent Fighters (design doc §29.2, §21.6). Pure logic; the
// service checks Influence, applies effects and tells the target.
import { healthiestFighterIndex } from "./galaxy-duke-combat.js";
import { MAX_FIGHTERS_PER_SYSTEM } from "./galaxy-duke-config.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import {
  BLIND_EYE_RENOWN_MULTIPLIER,
  GRIEVANCE_DURATION_MS,
  GRIEVANCE_LAPSE_RENOWN,
  GRIEVANCE_RENOWN_PER_HIT,
  LEND_DURATION_MS,
  MAX_LENT_FIGHTERS
} from "./galaxy-duke-politics-config.js";
import { findSystem, replaceSystem } from "./galaxy-duke-systems.js";
import type { DukeCounter, DukeState, Grievance } from "./galaxy-duke-types.js";

export const renownOf = (state: DukeState): number => state.renown ?? 0;

// The grievance this Duke holds open at `now`, if any.
export const openGrievance = (state: DukeState, now: number): Grievance | null =>
  state.grievance && now < state.grievance.expiresAt ? state.grievance : null;

export type DeclareErrorCode = "GRIEVANCE_ALREADY_OPEN" | "OWN_SECTOR" | "NOT_A_RIVAL";
export type DeclareResult = { ok: true; state: DukeState } | { ok: false; code: DeclareErrorCode };

export const declareGrievance = (state: DukeState, targetAuthUid: string, targetLabel: string, now: number): DeclareResult => {
  if (targetAuthUid === state.authUid) return { ok: false, code: "OWN_SECTOR" };
  if (openGrievance(state, now)) return { ok: false, code: "GRIEVANCE_ALREADY_OPEN" };
  const grievance: Grievance = { targetAuthUid, declaredAt: now, expiresAt: now + GRIEVANCE_DURATION_MS, hits: 0 };
  const text = `You declared a grievance against ${targetLabel}. For 14 days, every raid of yours that gets through on them earns Renown.`;
  return { ok: true, state: pushDigest({ ...state, grievance }, now, "POLITICS", text).state };
};

// A raid got through on `targetAuthUid`. Returns the Renown it earned (0 when no
// grievance is open against that Duke).
export const creditGrievanceHit = (
  state: DukeState,
  targetAuthUid: string,
  targetRevoked: boolean,
  now: number
): { state: DukeState; renown: number } => {
  const open = openGrievance(state, now);
  if (!open || open.targetAuthUid !== targetAuthUid) return { state, renown: 0 };
  const renown = GRIEVANCE_RENOWN_PER_HIT * (targetRevoked ? BLIND_EYE_RENOWN_MULTIPLIER : 1);
  return { state: { ...state, grievance: { ...open, hits: open.hits + 1 }, renown: renownOf(state) + renown }, renown };
};

// Closes a grievance whose time is up. One that never landed a hit costs Renown.
export const expireGrievance = (state: DukeState, now: number): { state: DukeState; counters: DukeCounter[] } => {
  const g = state.grievance;
  if (!g || now < g.expiresAt) return { state, counters: [] };
  if (g.hits > 0) {
    const pushed = pushDigest({ ...state, grievance: null }, now, "POLITICS", `Your grievance closed after ${g.hits} hit${g.hits === 1 ? "" : "s"}.`);
    return pushed;
  }
  const lost = Math.min(renownOf(state), GRIEVANCE_LAPSE_RENOWN);
  const text = `Your grievance lapsed without a single hit. -${lost} Renown.`;
  return pushDigest({ ...state, grievance: null, renown: renownOf(state) - lost }, now, "POLITICS", text);
};

export type LendErrorCode = "NO_SUCH_SYSTEM" | "NO_FIGHTER" | "TOO_MANY_LENT";
export type LendResult = { ok: true; state: DukeState } | { ok: false; code: LendErrorCode };

// Sends the healthiest Fighter at `fromSeasonId` to serve the Court for a Cycle.
export const lendFighter = (state: DukeState, fromSeasonId: string, now: number): LendResult => {
  const system = findSystem(state, fromSeasonId);
  if (!system) return { ok: false, code: "NO_SUCH_SYSTEM" };
  const idx = healthiestFighterIndex(system.fighters);
  if (idx === -1) return { ok: false, code: "NO_FIGHTER" };
  const lent = state.lent ?? [];
  if (lent.length >= MAX_LENT_FIGHTERS) return { ok: false, code: "TOO_MANY_LENT" };
  const hull = system.fighters[idx]!.hull;
  const next = replaceSystem(
    { ...state, lent: [...lent, { fromSeasonId, hull, returnsAt: now + LEND_DURATION_MS }] },
    { ...system, fighters: system.fighters.filter((_, i) => i !== idx) }
  );
  return { ok: true, state: next };
};

// Lent Fighters whose Cycle is over come home (or are lost when their system
// has gone, or it is already full).
export const returnLentFighters = (state: DukeState, now: number): { state: DukeState; counters: DukeCounter[] } => {
  const lent = state.lent ?? [];
  const due = lent.filter((l) => now >= l.returnsAt);
  if (due.length === 0) return { state, counters: [] };
  let next: DukeState = { ...state, lent: lent.filter((l) => now < l.returnsAt) };
  const counters: DukeCounter[] = [];
  for (const l of due) {
    const home = findSystem(next, l.fromSeasonId);
    const room = home !== undefined && home.fighters.length < MAX_FIGHTERS_PER_SYSTEM;
    if (home && room) next = replaceSystem(next, { ...home, fighters: [...home.fighters, { hull: l.hull }] });
    const text = room ? "A Fighter you lent the Court has come home." : "A Fighter you lent the Court had no berth to return to and stayed with the Court.";
    const pushed = pushDigest(next, now, "COURT", text);
    next = pushed.state;
    counters.push(...pushed.counters);
  }
  return { state: next, counters };
};
