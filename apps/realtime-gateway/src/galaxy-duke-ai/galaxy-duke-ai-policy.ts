// AI Dukes (§29.1): the decisions an AI-held Duke makes on each tick. Pure and
// deterministic, so the runner only has to carry the choices out through the
// same actions a player uses (no AI-only rules, no AI-only shortcuts).
import { HULL_MAX, MAX_FIGHTERS_PER_SYSTEM } from "../galaxy-duke-engine/galaxy-duke-config.js";
import type { BuildSpec } from "../galaxy-duke-engine/galaxy-duke-production.js";
import { systemBodyKinds } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
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
  petitionReady: boolean;
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
  | { kind: "PROBE"; fromSeasonId: string; targetSeasonId: string }
  | { kind: "DECLARE"; targetSeasonId: string }
  | { kind: "RAID"; fromSeasonId: string; targetSeasonId: string }
  | { kind: "LEND"; fromSeasonId: string }
  | { kind: "MOVE_AGAINST_COURT"; influence: number };

// Keep enough Influence in reserve that a wager never tips upkeep into deficit.
const INFLUENCE_RESERVE = 6;
const RAID_FIGHTERS_TO_KEEP_HOME = 1;
const DEVELOPMENT_ORDER = ["GAS_GIANT", "ASTEROID_BELT", "ICE_MOON"] as const;

const nextBuild = (input: AiTurnInput, system: DukeState["systems"][number], unsurveyed: boolean): BuildSpec | null => {
  const stability = input.stabilityBySeason.get(system.seasonId) ?? 100;
  const owned = system.fighters.length;
  if (owned === 0) return { kind: "FIGHTER" };
  if (system.fighters.some((f) => f.hull < 60)) return { kind: "REFIT" };
  if (stability <= 40) return { kind: "FORTIFY", points: Math.min(40, HULL_MAX - stability) };
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
  if (stability < 100) return { kind: "FORTIFY", points: HULL_MAX - stability };
  return null;
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
    const accept = !leader && (input.writ === "STRIKE" || defenceless);
    actions.push({ kind: "ANSWER_WRIT", accept });
  }

  const surveyed = new Set(state.intel.map((i) => i.seasonId));
  const inFlight = new Set(state.flights.map((f) => f.seasonId));
  const unsurveyed = input.rivals.filter((r) => !surveyed.has(r.seasonId) && !inFlight.has(r.seasonId));

  for (const system of state.systems) {
    if (system.slot) continue;
    const spec = nextBuild(input, system, unsurveyed.length > 0);
    if (spec) actions.push({ kind: "BUILD", seasonId: system.seasonId, spec });
  }

  const prober = state.systems.find((s) => s.probeStock > 0);
  const probeTarget = unsurveyed[0];
  if (prober && probeTarget) actions.push({ kind: "PROBE", fromSeasonId: prober.seasonId, targetSeasonId: probeTarget.seasonId });

  // Grievances go to a Duke the Court has abandoned, else the strongest Duke
  // ahead of this one. Only once the target has been surveyed.
  const target = [...input.rivals]
    .filter((r) => surveyed.has(r.seasonId))
    .sort((a, b) => Number(b.revoked) - Number(a.revoked) || b.weight - a.weight)
    .find((r) => r.revoked || r.weight > input.myWeight);
  const canAfford = (r: AiRival): boolean => r.revoked || input.influence >= GRIEVANCE_COST_INFLUENCE + INFLUENCE_RESERVE;
  let influence = input.influence;
  if (!input.grievanceOpenAgainst && target && canAfford(target)) {
    actions.push({ kind: "DECLARE", targetSeasonId: target.seasonId });
    if (!target.revoked) influence -= GRIEVANCE_COST_INFLUENCE;
  }

  const grievanceTarget = input.grievanceOpenAgainst ? input.rivals.find((r) => r.authUid === input.grievanceOpenAgainst) : undefined;
  if (grievanceTarget) {
    const intel = state.intel.find((i) => i.seasonId === grievanceTarget.seasonId);
    const raider = state.systems.find((s) => s.fighters.filter((f) => f.hull >= 80).length > RAID_FIGHTERS_TO_KEEP_HOME);
    const raidUnderway = state.flights.some((f) => f.kind === "RAID" && f.seasonId === grievanceTarget.seasonId);
    if (raider && intel && !raidUnderway && (intel.defenderHull === null || intel.defenderHull <= 60)) {
      actions.push({ kind: "RAID", fromSeasonId: raider.seasonId, targetSeasonId: grievanceTarget.seasonId });
    }
  }

  if (input.favorRevoked) {
    const lender = state.systems.find((s) => s.fighters.length > RAID_FIGHTERS_TO_KEEP_HOME);
    if (lender) actions.push({ kind: "LEND", fromSeasonId: lender.seasonId });
  }

  const spare = Math.floor(influence - INFLUENCE_RESERVE);
  if (input.petitionReady && spare >= 5) actions.push({ kind: "MOVE_AGAINST_COURT", influence: Math.min(20, spare) });
  return actions;
};
