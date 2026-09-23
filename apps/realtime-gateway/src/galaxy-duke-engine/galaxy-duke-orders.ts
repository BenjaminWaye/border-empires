// Give-an-order actions (§26.7): launching a Probe or a Fighter raid, and what
// happens when they arrive. Pure logic; the service supplies target views.
import {
  DERELICT_CHANCE_PERCENT,
  DERELICT_INFLUENCE,
  DERELICT_PRODUCTION,
  FIGHTER_TRAVEL_MS,
  MAX_INTEL,
  MAX_ORBITING_PROBES,
  PROBE_TRAVEL_MS
} from "./galaxy-duke-config.js";
import { healthiestFighterIndex, resolveFighterRaid } from "./galaxy-duke-combat.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import type { DukeEffect, DukeStep } from "./galaxy-duke-production.js";
import type { DukeCounter, DukeIntel, DukeState } from "./galaxy-duke-types.js";

export type OrderErrorCode = "NO_PROBE" | "NO_FIGHTER" | "ORDER_IN_FLIGHT" | "OWN_SECTOR" | "NOT_SURVEYED";
export type OrderResult = { ok: true; state: DukeState } | { ok: false; code: OrderErrorCode };

export type TargetView = {
  seasonId: string;
  label: string;
  stability: number;
  defenderHull: number | null;
};

export const launchProbe = (state: DukeState, seasonId: string, ownedSeasonIds: ReadonlySet<string>, now: number): OrderResult => {
  if (state.inFlight) return { ok: false, code: "ORDER_IN_FLIGHT" };
  if (state.probeStock < 1) return { ok: false, code: "NO_PROBE" };
  if (ownedSeasonIds.has(seasonId)) return { ok: false, code: "OWN_SECTOR" };
  const next: DukeState = {
    ...state,
    probeStock: state.probeStock - 1,
    inFlight: { kind: "PROBE", seasonId, launchedAt: now, arrivesAt: now + PROBE_TRAVEL_MS }
  };
  return { ok: true, state: pushDigest(next, now, "INTEL", "Probe launched.").state };
};

export const launchRaid = (state: DukeState, seasonId: string, ownedSeasonIds: ReadonlySet<string>, now: number): OrderResult => {
  if (state.inFlight) return { ok: false, code: "ORDER_IN_FLIGHT" };
  if (ownedSeasonIds.has(seasonId)) return { ok: false, code: "OWN_SECTOR" };
  if (!state.intel.some((i) => i.seasonId === seasonId)) return { ok: false, code: "NOT_SURVEYED" };
  const idx = healthiestFighterIndex(state.fighters);
  if (idx === -1) return { ok: false, code: "NO_FIGHTER" };
  const fighter = state.fighters[idx]!;
  const next: DukeState = {
    ...state,
    fighters: state.fighters.filter((_, i) => i !== idx),
    inFlight: { kind: "RAID", seasonId, launchedAt: now, arrivesAt: now + FIGHTER_TRAVEL_MS, fighterHull: fighter.hull }
  };
  return { ok: true, state: pushDigest(next, now, "COMBAT", "Fighter launched on a raid. Your Sector has one less defender until it returns.").state };
};

const hash = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// Deterministic so a replayed tick can never re-roll a different find.
export const derelictRoll = (authUid: string, seasonId: string): { found: boolean; reward: "INFLUENCE" | "PRODUCTION" } => {
  const h = hash(`${authUid}:${seasonId}`);
  return { found: h % 100 < DERELICT_CHANCE_PERCENT, reward: (h >>> 8) & 1 ? "INFLUENCE" : "PRODUCTION" };
};

const describeDefender = (hull: number | null): string => (hull === null ? "undefended" : `defended by a Fighter (hull ${hull}%)`);

const upsertIntel = (state: DukeState, intel: DukeIntel): { state: DukeState; counters: DukeCounter[] } => {
  const rest = state.intel.filter((i) => i.seasonId !== intel.seasonId);
  let list = [...rest, intel];
  const counters: DukeCounter[] = [];
  while (list.length > MAX_INTEL) {
    const oldest = list.reduce((min, i) => (i.at < min.at ? i : min), list[0]!);
    list = list.filter((i) => i !== oldest);
    counters.push("duke_intel_evicted");
  }
  return { state: { ...state, intel: list }, counters };
};

export const arriveProbe = (state: DukeState, target: TargetView, now: number): DukeStep => {
  const firstLook = !state.intel.some((i) => i.seasonId === target.seasonId);
  const counters: DukeCounter[] = [];
  const effects: DukeEffect[] = [];
  let next: DukeState = { ...state, inFlight: null };

  const upserted = upsertIntel(next, { seasonId: target.seasonId, label: target.label, stability: target.stability, defenderHull: target.defenderHull, at: now, live: true });
  next = upserted.state;
  counters.push(...upserted.counters);

  let orbiting = [...next.orbiting.filter((o) => o.seasonId !== target.seasonId), { seasonId: target.seasonId, arrivedAt: now }];
  while (orbiting.length > MAX_ORBITING_PROBES) {
    const retired = orbiting.shift()!;
    next = { ...next, intel: next.intel.map((i) => (i.seasonId === retired.seasonId ? { ...i, live: false } : i)) };
    counters.push("duke_probe_orbit_retired");
    next = pushDigest(next, now, "INTEL", "An older Probe lost contact. Its system is now a dated snapshot.").state;
  }
  next = { ...next, orbiting };

  let text = `Probe reached ${target.label} and is now in orbit. Stability ${target.stability}, ${describeDefender(target.defenderHull)}.`;
  if (firstLook) {
    const roll = derelictRoll(state.authUid, target.seasonId);
    if (roll.found) {
      if (roll.reward === "INFLUENCE") {
        effects.push({ kind: "INFLUENCE_DELTA", delta: DERELICT_INFLUENCE });
        text += ` The Probe found a derelict: +${DERELICT_INFLUENCE} Influence.`;
      } else {
        next = { ...next, idleBank: next.idleBank + DERELICT_PRODUCTION };
        text += ` The Probe found a derelict: +${DERELICT_PRODUCTION} Production.`;
      }
    }
  }
  const pushed = pushDigest(next, now, "INTEL", text);
  return { state: pushed.state, counters: [...counters, ...pushed.counters], effects };
};

export type RaidTarget = { seasonId: string; label: string; stability: number };

export type RaidStep = {
  attacker: DukeState;
  defender: DukeState | null;
  counters: DukeCounter[];
  // Applied to the *target's* Sector, not the attacker's.
  targetStabilityDelta: number;
};

export const resolveRaidArrival = (attacker: DukeState, defender: DukeState | null, target: RaidTarget, now: number): RaidStep => {
  const flight = attacker.inFlight;
  if (!flight || flight.kind !== "RAID") return { attacker, defender, counters: [], targetStabilityDelta: 0 };
  const outcome = resolveFighterRaid(flight.fighterHull, defender?.fighters ?? []);
  const counters: DukeCounter[] = [];

  const returned = outcome.attackerLost ? attacker.fighters : [...attacker.fighters, { hull: outcome.attackerHullAfter }];
  let nextAttacker: DukeState = { ...attacker, inFlight: null, fighters: returned };
  const after = Math.max(0, target.stability - outcome.stabilityLoss);
  const hull = outcome.attackerLost ? "your Fighter was destroyed" : `your Fighter hull ${flight.fighterHull}% to ${outcome.attackerHullAfter}%`;
  const result = outcome.through ? `Stability ${target.stability} to ${after}` : "the defending Fighter held";
  const a = pushDigest(nextAttacker, now, "COMBAT", `Raid on ${target.label}: ${result}, ${hull}.`);
  nextAttacker = a.state;
  counters.push(...a.counters);

  let nextDefender = defender;
  if (defender) {
    const defenderText = outcome.through
      ? `A rival Fighter raided ${target.label}: Stability ${target.stability} to ${after}. This Sector can take ${Math.floor(after / 20)} more hits before it is contested.`
      : `A rival Fighter raided ${target.label} and was held off.`;
    const d = pushDigest({ ...defender, fighters: outcome.defenderFighters }, now, "COMBAT", defenderText);
    nextDefender = d.state;
    counters.push(...d.counters);
  }
  return { attacker: nextAttacker, defender: nextDefender, counters, targetStabilityDelta: outcome.stabilityLoss === 0 ? 0 : -outcome.stabilityLoss };
};

// Live intel (§26.7): while a Probe orbits, the digest reports changes.
export const refreshOrbitIntel = (
  state: DukeState,
  lookup: (seasonId: string) => TargetView | undefined,
  now: number
): { state: DukeState; counters: DukeCounter[] } => {
  let next = state;
  const counters: DukeCounter[] = [];
  for (const orbit of state.orbiting) {
    const view = lookup(orbit.seasonId);
    const known = next.intel.find((i) => i.seasonId === orbit.seasonId);
    if (!view || !known || !known.live) continue;
    if (view.stability === known.stability && view.defenderHull === known.defenderHull) continue;
    const text = `Probe over ${view.label}: Stability ${known.stability} to ${view.stability}; ${describeDefender(view.defenderHull)}.`;
    next = { ...next, intel: next.intel.map((i) => (i.seasonId === orbit.seasonId ? { ...i, stability: view.stability, defenderHull: view.defenderHull, at: now } : i)) };
    const pushed = pushDigest(next, now, "INTEL", text);
    next = pushed.state;
    counters.push(...pushed.counters);
  }
  return { state: next, counters };
};
