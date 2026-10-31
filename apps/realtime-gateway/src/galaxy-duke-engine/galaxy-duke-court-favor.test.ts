import { describe, expect, it } from "vitest";

import { answerWrit, isRunaway, maybeOfferWrit, updateFavor, writChancePercent } from "./galaxy-duke-court-favor.js";
import { duke } from "./galaxy-duke-fixtures.js";
import { lendFighter } from "./galaxy-duke-grievance.js";
import { BLIND_EYE_SUSTAIN_MS } from "./galaxy-duke-politics-config.js";
import { planBuild } from "./galaxy-duke-production.js";
import { replaceSystem } from "./galaxy-duke-systems.js";

describe("Court Favor", () => {
  it("is a runaway only at 1.5x second place, and only with a rival", () => {
    expect(isRunaway(30, 20)).toBe(true);
    expect(isRunaway(29, 20)).toBe(false);
    expect(isRunaway(30, null)).toBe(false);
  });

  it("is revoked only after a full Cycle in the lead, and restored once the lead narrows", () => {
    const started = updateFavor(duke(), true, 0).state;
    expect(started.favor).toMatchObject({ leadSince: 0, revoked: false });
    expect(updateFavor(started, true, BLIND_EYE_SUSTAIN_MS - 1).state.favor?.revoked).toBe(false);
    const revoked = updateFavor(started, true, BLIND_EYE_SUSTAIN_MS);
    expect(revoked.state.favor?.revoked).toBe(true);
    expect(revoked.state.digest.at(-1)?.text).toMatch(/blind eye/);
    const restored = updateFavor(revoked.state, false, BLIND_EYE_SUSTAIN_MS + 1);
    expect(restored.state.favor).toMatchObject({ leadSince: null, revoked: false });
  });
});

describe("Writs", () => {
  it("are offered more often as the Court weakens and to the top half", () => {
    expect(writChancePercent(300, 300, false)).toBe(10);
    expect(writChancePercent(150, 300, false)).toBe(25);
    expect(writChancePercent(0, 300, true)).toBe(50);
  });

  it("roll at most once per Cycle, the same way every time", () => {
    const rival = { authUid: "uid-b", seasonId: "season-b" };
    const always = maybeOfferWrit(duke(), { cycleIndex: 3, chancePercent: 100, rival, now: 0 });
    expect(always.offered).toBe(true);
    const refused = answerWrit(always.state, false, 1);
    if (!refused.ok) throw new Error("expected a pending Writ");
    expect(maybeOfferWrit(refused.state, { cycleIndex: 3, chancePercent: 100, rival, now: 2 }).offered).toBe(false);
    expect(maybeOfferWrit(refused.state, { cycleIndex: 4, chancePercent: 100, rival, now: 2 }).offered).toBe(true);
    expect(maybeOfferWrit(duke(), { cycleIndex: 3, chancePercent: 0, rival, now: 0 }).offered).toBe(false);
  });

  it("without a rival the offer is always a Fighter", () => {
    for (let cycle = 0; cycle < 20; cycle += 1) {
      expect(maybeOfferWrit(duke(), { cycleIndex: cycle, chancePercent: 100, rival: null, now: 0 }).state.writ?.offer?.kind).toBe("FIGHTER");
    }
  });
});

describe("Fighter cap", () => {
  it("counts Fighters lent to the Court, but not a Court Fighter on a Writ strike", () => {
    const base = duke();
    const full = replaceSystem(base, { ...base.systems[0]!, fighters: [{ hull: 100 }, { hull: 100 }, { hull: 100 }] });
    const lent = lendFighter(full, "s1", 0);
    expect(lent.ok && planBuild(lent.state, "s1", { kind: "FIGHTER" }, 100)).toMatchObject({ ok: false, code: "FIGHTER_CAP" });
    const withStrike = {
      ...base,
      flights: [{ kind: "RAID" as const, fromSeasonId: "s1", seasonId: "x", launchedAt: 0, arrivesAt: 1, fighterHull: 100, courtWrit: true }]
    };
    expect(planBuild(withStrike, "s1", { kind: "FIGHTER" }, 100).ok).toBe(true);
  });
});
