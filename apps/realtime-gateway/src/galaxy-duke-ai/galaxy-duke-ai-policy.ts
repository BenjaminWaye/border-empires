// AI Dukes (§29.1): the decisions an AI-held Duke makes on each tick. Pure and
// deterministic, so the runner only has to carry the choices out through the
// same actions a player uses (no AI-only rules, no AI-only shortcuts). Like a
// player, an AI has one order per system and one decree a day (§30), so it
// picks at most one of each; answering offers is free.
import { MAX_FIGHTERS_PER_SYSTEM } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { fightersOwned, type BuildSpec } from "../galaxy-duke-engine/galaxy-duke-production.js";
import { systemBodyKinds } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState, SystemState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { GRIEVANCE_COST_INFLUENCE } from "../galaxy-duke-engine/galaxy-duke-politics-config.js";

export { isAiDukeUid as isAiDuke } from "../galaxy-holdings/galaxy-holdings.js";

export type AiRival = {
  authUid: string;
  // The rival's first Planet: where the AI probes, declares and raids.
  seasonId: string;
  weight: number;
  revoked: boolean;
};

export type AiTurnInput = {
  state: DukeState;
  now: number;
  influence: number;
  myWeight: number;
  stabilityBySeason: ReadonlyMap<string, number>;
  rivals: ReadonlyArray<AiRival>;
  // Systems whose order for the day is still unused.
  ordersReady: ReadonlySet<string>;
  decreeReady: boolean;
  // Move Against the Court is open (the Court stands and no offer locks it).
  canMoveAgainstCourt: boolean;
  grievanceOpenAgainst: string | null;
  // The kind of Writ waiting for an answer, if any.
  writ: "FIGHTER" | "STRIKE" | null;
  courtOfferPending: boolean;
  favorRevoked: boolean;
};

export type AiAction =
  | { kind: "ANSWER_COURT_OFFER"; accept: boolean }
  | { kind: "ANSWER_WRIT"; accept: boolean }
  | { kind: "BUILD"; seasonId: string; spec: BuildSpec }
  | { kind: "FORTIFY"; seasonId: string }
  | { kind: "PROBE"; fromSeasonId: string; targetSeasonId: string }
  | { kind: "RAID"; fromSeasonId: string; targetSeasonId: string }
  | { kind: "DECLARE"; targetSeasonId: string }
  | { kind: "LEND"; fromSeasonId: string }
  | { kind: "MOVE_AGAINST_COURT"; influence: number }
  | { kind: "HOLD_COURT" };

// Keep enough Influence in reserve that a wager never tips upkeep into deficit.
const INFLUENCE_RESERVE = 6;
const RAID_FIGHTERS_TO_KEEP_HOME = 1;
const FORTIFY_BELOW = 60;
const DEVELOPMENT_ORDER = ["GAS_GIANT", "ASTEROID_BELT", "ICE_MOON"] as const;

const nextBuild = (input: AiTurnInput, system: SystemState, unsurveyed: boolean): BuildSpec | null => {
  if (system.slot) return null;
  const owned = fightersOwned(input.state, system);
  if (owned === 0) return { kind: "FIGHTER" };
  if (system.fighters.some((f) => f.hull < 60)) return { kind: "REFIT" };
  const bodies = systemBodyKinds(system.seasonId);
  const free = system.developments.length === 0;
  for (const kind of DEVELOPMENT_ORDER) {
    const index = bodies.findIndex((b, i) => b === kind && !system.developments.some((d) => d.bodyIndex === i));
    // Only the first development in a system is free of upkeep; later ones
    // wait until Influence can carry them.
    if (index >= 0 && (free || input.influence >= INFLUENCE_RESERVE + 4)) return { kind: "DEVELOP", bodyIndex: index };
  }
  if (system.probeStock === 0 && unsurveyed) return { kind: "PROBE" };
  if (owned < MAX_FIGHTERS_PER_SYSTEM) return { kind: "FIGHTER" };
  return null;
};

// The one order for a system: raid if this is the raiding system, else launch
// a Probe, else fortify a shaken world, else build.
const orderFor = (input: AiTurnInput, system: SystemState, raidFrom: string | null, raidTarget: string | null, probeTarget: string | null): AiAction | null => {
  if (raidTarget && raidFrom === system.seasonId) return { kind: "RAID", fromSeasonId: system.seasonId, targetSeasonId: raidTarget };
  if (probeTarget && system.probeStock > 0) return { kind: "PROBE", fromSeasonId: system.seasonId, targetSeasonId: probeTarget };
  if ((input.stabilityBySeason.get(system.seasonId) ?? 100) < FORTIFY_BELOW) return { kind: "FORTIFY", seasonId: system.seasonId };
  const spec = nextBuild(input, system, probeTarget !== null);
  return spec ? { kind: "BUILD", seasonId: system.seasonId, spec } : null;
};

export const planAiTurn = (input: AiTurnInput): AiAction[] => {
  const { state } = input;
  const actions: AiAction[] = [];
  const alone = input.rivals.length === 0;
  // A lone AI takes the Court's protection; with rivals about, it keeps its
  // freedom to Move Against the Court.
  if (input.courtOfferPending) actions.push({ kind: "ANSWER_COURT_OFFER", accept: alone });
  const leader = input.rivals.every((r) => r.weight <= input.myWeight);
  // Every Writ taken lifts the Court for everyone, and a galaxy can hold many
  // AI Houses, so an AI takes one only when it really helps: a strike on the
  // leader (STRIKE always names the top-ranked rival), or a Fighter when it
  // has none at all. The leader never takes one.
  if (input.writ) {
    const defenceless = state.systems.every((s) => s.fighters.length === 0);
    actions.push({ kind: "ANSWER_WRIT", accept: !leader && (input.writ === "STRIKE" || defenceless) });
  }

  const surveyed = new Set(state.intel.map((i) => i.seasonId));
  const inFlight = new Set(state.flights.map((f) => f.seasonId));
  const probeTarget = input.rivals.find((r) => !surveyed.has(r.seasonId) && !inFlight.has(r.seasonId))?.seasonId ?? null;

  // A raid on the grievance target, from a system that keeps a defender home,
  // never into a healthy defender.
  const grievanceTarget = input.grievanceOpenAgainst ? input.rivals.find((r) => r.authUid === input.grievanceOpenAgainst) : undefined;
  let raidFrom: string | null = null;
  if (grievanceTarget) {
    const intel = state.intel.find((i) => i.seasonId === grievanceTarget.seasonId);
    const underway = state.flights.some((f) => f.kind === "RAID" && f.seasonId === grievanceTarget.seasonId);
    const raider = state.systems.find((s) => input.ordersReady.has(s.seasonId) && s.fighters.filter((f) => f.hull >= 80).length > RAID_FIGHTERS_TO_KEEP_HOME);
    if (raider && intel && !underway && (intel.defenderHull === null || intel.defenderHull <= 60)) raidFrom = raider.seasonId;
  }

  let probeClaimed = false;
  for (const system of state.systems) {
    if (!input.ordersReady.has(system.seasonId)) continue;
    const order = orderFor(input, system, raidFrom, grievanceTarget?.seasonId ?? null, probeClaimed ? null : probeTarget);
    if (!order) continue;
    if (order.kind === "PROBE") probeClaimed = true;
    actions.push(order);
  }

  if (input.decreeReady) actions.push(decreeFor(input, surveyed));
  return actions;
};

// The one decree: win back the Court's Favor, else declare on a target, else
// weaken the Court with spare Influence, else hold court.
const decreeFor = (input: AiTurnInput, surveyed: ReadonlySet<string>): AiAction => {
  if (input.favorRevoked) {
    const lender = input.state.systems.find((s) => s.fighters.length > RAID_FIGHTERS_TO_KEEP_HOME);
    if (lender) return { kind: "LEND", fromSeasonId: lender.seasonId };
  }
  const target = [...input.rivals]
    .filter((r) => surveyed.has(r.seasonId))
    .sort((a, b) => Number(b.revoked) - Number(a.revoked) || b.weight - a.weight)
    .find((r) => r.revoked || r.weight > input.myWeight);
  if (!input.grievanceOpenAgainst && target && (target.revoked || input.influence >= GRIEVANCE_COST_INFLUENCE + INFLUENCE_RESERVE)) {
    return { kind: "DECLARE", targetSeasonId: target.seasonId };
  }
  const spare = Math.floor(input.influence - INFLUENCE_RESERVE);
  if (input.canMoveAgainstCourt && spare >= 5) return { kind: "MOVE_AGAINST_COURT", influence: Math.min(20, spare) };
  return { kind: "HOLD_COURT" };
};
