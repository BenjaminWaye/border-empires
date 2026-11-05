import { describe, expect, it } from "vitest";

import { duke, planet, seasonWithBody } from "../galaxy-duke-engine/galaxy-duke-fixtures.js";
import { findSystem, replaceSystem } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { planAiTurn, type AiRival, type AiTurnInput } from "./galaxy-duke-ai-policy.js";

const rival = (over: Partial<AiRival> = {}): AiRival => ({ authUid: "uid-b", seasonId: "season-b", weight: 20, revoked: false, ...over });

const input = (state: DukeState, over: Partial<AiTurnInput> = {}): AiTurnInput => ({
  state,
  now: 0,
  influence: 0,
  myWeight: 10,
  stabilityBySeason: new Map(),
  rivals: [rival()],
  petitionReady: false,
  grievanceOpenAgainst: null,
  writ: null,
  courtOfferPending: false,
  favorRevoked: false,
  ...over
});

const withFighters = (state: DukeState, hulls: number[]): DukeState =>
  replaceSystem(state, { ...state.systems[0]!, fighters: hulls.map((hull) => ({ hull })) });

describe("planAiTurn", () => {
  it("builds a Fighter first in an undefended system", () => {
    expect(planAiTurn(input(duke([planet("s1")])))).toContainEqual({ kind: "BUILD", seasonId: "s1", spec: { kind: "FIGHTER" } });
  });

  it("develops its first body once it has a defender", () => {
    const { seasonId, bodyIndex } = seasonWithBody("GAS_GIANT");
    const state = withFighters(duke([planet(seasonId)]), [100]);
    expect(planAiTurn(input(state))).toContainEqual({ kind: "BUILD", seasonId, spec: { kind: "DEVELOP", bodyIndex } });
  });

  it("accepts the Court's protection only when it has no rivals", () => {
    const state = duke();
    expect(planAiTurn(input(state, { courtOfferPending: true, rivals: [] }))).toContainEqual({ kind: "ANSWER_COURT_OFFER", accept: true });
    expect(planAiTurn(input(state, { courtOfferPending: true }))).toContainEqual({ kind: "ANSWER_COURT_OFFER", accept: false });
  });

  it("takes a strike Writ when behind, never when leading", () => {
    expect(planAiTurn(input(duke(), { writ: "STRIKE" }))).toContainEqual({ kind: "ANSWER_WRIT", accept: true });
    expect(planAiTurn(input(duke(), { writ: "STRIKE", myWeight: 50 }))).toContainEqual({ kind: "ANSWER_WRIT", accept: false });
  });

  it("takes a Fighter Writ only when it has no Fighter, so AI Houses do not keep lifting the Court", () => {
    expect(planAiTurn(input(duke(), { writ: "FIGHTER" }))).toContainEqual({ kind: "ANSWER_WRIT", accept: true });
    expect(planAiTurn(input(withFighters(duke(), [100]), { writ: "FIGHTER" }))).toContainEqual({ kind: "ANSWER_WRIT", accept: false });
  });

  it("declares against a surveyed rival ahead of it, then raids it while keeping a defender home", () => {
    const base = withFighters(duke(), [100, 100]);
    const surveyed: DukeState = { ...base, intel: [{ seasonId: "season-b", label: "B", stability: 100, defenderHull: null, at: 0, live: true }] };
    expect(planAiTurn(input(surveyed, { influence: 20 }))).toContainEqual({ kind: "DECLARE", targetSeasonId: "season-b" });
    const actions = planAiTurn(input(surveyed, { grievanceOpenAgainst: "uid-b" }));
    expect(actions).toContainEqual({ kind: "RAID", fromSeasonId: "s1", targetSeasonId: "season-b" });
    expect(planAiTurn(input(withFighters(surveyed, [100]), { grievanceOpenAgainst: "uid-b" })).some((a) => a.kind === "RAID")).toBe(false);
  });

  it("does not raid into a healthy defender", () => {
    const base = withFighters(duke(), [100, 100]);
    const state: DukeState = { ...base, intel: [{ seasonId: "season-b", label: "B", stability: 100, defenderHull: 100, at: 0, live: true }] };
    expect(planAiTurn(input(state, { grievanceOpenAgainst: "uid-b" })).some((a) => a.kind === "RAID")).toBe(false);
  });

  it("lends a spare Fighter when the Court looks away, and wagers spare Influence", () => {
    const state = withFighters(duke(), [100, 100]);
    const actions = planAiTurn(input(state, { favorRevoked: true, petitionReady: true, influence: 16 }));
    expect(actions).toContainEqual({ kind: "LEND", fromSeasonId: "s1" });
    expect(actions).toContainEqual({ kind: "MOVE_AGAINST_COURT", influence: 10 });
    expect(findSystem(state, "s1")).toBeDefined();
  });
});
