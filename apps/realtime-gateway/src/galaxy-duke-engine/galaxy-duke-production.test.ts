import { describe, expect, it } from "vitest";
import { MS_PER_DAY } from "../galaxy-production-queue/galaxy-production-queue.js";
import { advanceSystem, applyCompletedBuild, cancelBuild, planBuild, startPlannedBuild } from "./galaxy-duke-production.js";
import { createDukeState, developmentUpkeepPerCycle, findSystem, replaceSystem, syncSystems, systemDailyRate } from "./galaxy-duke-systems.js";
import { duke, planet, seasonWithBody } from "./galaxy-duke-fixtures.js";

describe("createDukeState (first contact)", () => {
  it("announces an incursion at the first system in 3 days, presents the Court offer, and starts with nothing built", () => {
    const state = createDukeState("u", [planet("a"), planet("b")], 1_000, 5);
    expect(findSystem(state, "a")?.incursion.arrivesAt).toBe(1_000 + 3 * MS_PER_DAY);
    expect(findSystem(state, "b")?.incursion.arrivesAt).toBeNull();
    expect(state.lastCycleApplied).toBe(5);
    expect(state.courtOffer).toEqual({ status: "PENDING" });
    expect(state.systems.every((s) => s.slot === null && s.fighters.length === 0)).toBe(true);
    expect(state.digest[0]?.text).toMatch(/Arrival in 3 days/);
  });
});

const H = 60 * 60 * 1000;
const build = (kind: "FIGHTER" | "PROBE" | "REFIT") => ({ kind, label: kind, startedAt: 0, completesAt: 1 });

describe("systemDailyRate", () => {
  it("is the Planet's own rate, plus Harvesters and Mining Stations", () => {
    const base = findSystem(duke(), "s1")!;
    expect(systemDailyRate(base)).toBe(6);
    const grown = { ...base, developments: [{ bodyIndex: 0, kind: "HARVESTER" as const }, { bodyIndex: 1, kind: "MINING" as const }] };
    expect(systemDailyRate(grown)).toBe(6 + 3 + 2);
    expect(systemDailyRate({ ...base, developments: [{ bodyIndex: 0, kind: "CRYO" as const }] })).toBe(6);
    expect(systemDailyRate(findSystem(duke([planet("s1", "CAPITAL")]), "s1")!)).toBe(2);
  });
});

describe("planBuild (§30: every build finishes within a day)", () => {
  it("times builds by the system's Production: an Industrial world builds a Fighter in 8h, a Capital world in a day", () => {
    expect(planBuild(duke(), "s1", { kind: "FIGHTER" })).toEqual({ ok: true, build: { kind: "FIGHTER", label: "Fighter", durationMs: 8 * H } });
    expect(planBuild(duke(), "s1", { kind: "PROBE" })).toMatchObject({ ok: true, build: { durationMs: 4 * H } });
    expect(planBuild(duke([planet("s1", "CAPITAL")]), "s1", { kind: "FIGHTER" })).toMatchObject({ ok: true, build: { durationMs: 24 * H } });
    expect(planBuild(duke([planet("s1", "LOGISTICS")]), "s1", { kind: "FIGHTER" })).toMatchObject({ ok: true, build: { durationMs: 12 * H } });
  });
  it("never takes longer than a day, and developments make a system build faster", () => {
    const capital = duke([planet("s1", "CAPITAL")]);
    const based = replaceSystem(capital, { ...findSystem(capital, "s1")!, bases: [0] });
    expect(planBuild(based, "s1", { kind: "DEVELOP", bodyIndex: 0 })).toMatchObject({ ok: true, build: { durationMs: 24 * H } });
    const harvested = replaceSystem(capital, { ...findSystem(capital, "s1")!, developments: [{ bodyIndex: 1, kind: "HARVESTER" }] });
    const plan = planBuild(harvested, "s1", { kind: "FIGHTER" });
    expect(plan.ok && plan.build.durationMs).toBeLessThan(24 * H);
  });
  it("each system has its own slot: one busy system does not block another", () => {
    let state = duke([planet("a"), planet("b")]);
    state = startPlannedBuild(state, "a", { kind: "PROBE", label: "Probe", durationMs: 4 * H }, 0);
    expect(findSystem(state, "a")?.slot).toMatchObject({ startedAt: 0, completesAt: 4 * H });
    expect(planBuild(state, "a", { kind: "FIGHTER" })).toEqual({ ok: false, code: "SLOT_BUSY" });
    expect(planBuild(state, "b", { kind: "FIGHTER" }).ok).toBe(true);
    expect(planBuild(state, "zzz", { kind: "FIGHTER" })).toEqual({ ok: false, code: "NO_SUCH_SYSTEM" });
    expect(findSystem(cancelBuild(state, "a"), "a")?.slot).toBeNull();
  });
  it("develops a body by its kind: Harvester on a gas giant, Mining on a belt, Cryo on an ice moon", () => {
    const cases = [
      ["GAS_GIANT", "HARVESTER"],
      ["ASTEROID_BELT", "MINING"],
      ["ICE_MOON", "CRYO"]
    ] as const;
    for (const [body, development] of cases) {
      const { seasonId, bodyIndex } = seasonWithBody(body);
      const state = duke([planet(seasonId)]);
      const based = replaceSystem(state, { ...findSystem(state, seasonId)!, bases: [bodyIndex] });
      expect(planBuild(based, seasonId, { kind: "DEVELOP", bodyIndex })).toMatchObject({ ok: true, build: { kind: "DEVELOP", bodyIndex, development } });
    }
  });
  it("a body needs a base before it can be developed (§31); a base is an 8h build", () => {
    const { seasonId, bodyIndex } = seasonWithBody("GAS_GIANT");
    const state = duke([planet(seasonId)]);
    expect(planBuild(state, seasonId, { kind: "DEVELOP", bodyIndex })).toEqual({ ok: false, code: "NO_BASE" });
    expect(planBuild(state, seasonId, { kind: "BASE", bodyIndex })).toEqual({ ok: true, build: { kind: "BASE", label: "Base", bodyIndex, durationMs: 8 * H } });
    const done = applyCompletedBuild(state, seasonId, { kind: "BASE", label: "Base", startedAt: 0, completesAt: 1, bodyIndex }, 1).state;
    expect(findSystem(done, seasonId)?.bases).toEqual([bodyIndex]);
    expect(planBuild(done, seasonId, { kind: "BASE", bodyIndex })).toEqual({ ok: false, code: "BASE_ALREADY_THERE" });
    expect(planBuild(done, seasonId, { kind: "DEVELOP", bodyIndex }).ok).toBe(true);
    // A body developed before bases existed counts as based.
    const developed = replaceSystem(state, { ...findSystem(state, seasonId)!, developments: [{ bodyIndex, kind: "HARVESTER" }] });
    expect(planBuild(developed, seasonId, { kind: "BASE", bodyIndex })).toEqual({ ok: false, code: "BASE_ALREADY_THERE" });
  });
  it("refuses a body that doesn't exist or is already developed", () => {
    const { seasonId, bodyIndex } = seasonWithBody("GAS_GIANT");
    const state = duke([planet(seasonId)]);
    expect(planBuild(state, seasonId, { kind: "DEVELOP", bodyIndex: 99 })).toEqual({ ok: false, code: "NO_SUCH_BODY" });
    expect(planBuild(state, seasonId, { kind: "DEVELOP", bodyIndex: -1 })).toEqual({ ok: false, code: "NO_SUCH_BODY" });
    const developed = replaceSystem(state, { ...findSystem(state, seasonId)!, developments: [{ bodyIndex, kind: "HARVESTER" }] });
    expect(planBuild(developed, seasonId, { kind: "DEVELOP", bodyIndex })).toEqual({ ok: false, code: "BODY_ALREADY_DEVELOPED" });
  });
  it("caps Fighters at 3 per system, counting one away on a raid, and Probes at 3", () => {
    let state = duke();
    state = replaceSystem(state, { ...findSystem(state, "s1")!, fighters: [{ hull: 100 }, { hull: 100 }] });
    state = { ...state, flights: [{ kind: "RAID", fromSeasonId: "s1", seasonId: "x", launchedAt: 0, arrivesAt: 1, fighterHull: 100 }] };
    expect(planBuild(state, "s1", { kind: "FIGHTER" })).toEqual({ ok: false, code: "FIGHTER_CAP" });
    expect(planBuild(replaceSystem(duke(), { ...findSystem(duke(), "s1")!, probeStock: 3 }), "s1", { kind: "PROBE" })).toEqual({ ok: false, code: "PROBE_STOCK_CAP" });
  });
  it("Refit refuses when nothing needs repair", () => {
    expect(planBuild(duke(), "s1", { kind: "REFIT" })).toEqual({ ok: false, code: "NOTHING_TO_REPAIR" });
    const hurt = replaceSystem(duke(), { ...findSystem(duke(), "s1")!, fighters: [{ hull: 30 }] });
    expect(planBuild(hurt, "s1", { kind: "REFIT" })).toMatchObject({ ok: true, build: { durationMs: 4 * H } });
  });
});

describe("advanceSystem", () => {
  it("finishes a build exactly when its timer is up, not before", () => {
    const state = startPlannedBuild(duke(), "s1", { kind: "FIGHTER", label: "Fighter", durationMs: 8 * H }, 0);
    const system = findSystem(state, "s1")!;
    expect(advanceSystem(system, 8 * H - 1).completed).toBeNull();
    const done = advanceSystem(system, 8 * H);
    expect(done.completed?.kind).toBe("FIGHTER");
    expect(done.system.slot).toBeNull();
    expect(advanceSystem(done.system, 9 * H).completed).toBeNull();
  });
});

describe("applyCompletedBuild", () => {
  it("a Fighter joins its own system at full hull; a Probe joins that system's stock", () => {
    const state = duke([planet("a"), planet("b")]);
    const f = applyCompletedBuild(state, "a", build("FIGHTER"), 1).state;
    expect(findSystem(f, "a")?.fighters).toEqual([{ hull: 100 }]);
    expect(findSystem(f, "b")?.fighters).toEqual([]);
    expect(findSystem(applyCompletedBuild(state, "b", build("PROBE"), 1).state, "b")?.probeStock).toBe(1);
  });
  it("a development is recorded on its body and announced with its effect", () => {
    const { seasonId, bodyIndex } = seasonWithBody("GAS_GIANT");
    const done = { kind: "DEVELOP" as const, label: "Gas Harvester", startedAt: 0, completesAt: 1, bodyIndex, development: "HARVESTER" as const };
    const step = applyCompletedBuild(duke([planet(seasonId)]), seasonId, done, 1);
    expect(findSystem(step.state, seasonId)?.developments).toEqual([{ bodyIndex, kind: "HARVESTER" }]);
    expect(step.state.digest.at(-1)?.text).toBe("Gas Harvester online: +3 Production: builds here go faster.");
  });
  it("Refit restores every Fighter in the system", () => {
    const hurt = replaceSystem(duke(), { ...findSystem(duke(), "s1")!, fighters: [{ hull: 90 }, { hull: 30 }] });
    expect(findSystem(applyCompletedBuild(hurt, "s1", build("REFIT"), 1).state, "s1")?.fighters).toEqual([{ hull: 100 }, { hull: 100 }]);
  });
});

describe("developmentUpkeepPerCycle", () => {
  it("the first development in each system is free; each further one costs 1 Influence", () => {
    let state = duke([planet("a"), planet("b")]);
    expect(developmentUpkeepPerCycle(state)).toBe(0);
    const dev = (i: number) => ({ bodyIndex: i, kind: "MINING" as const });
    state = replaceSystem(state, { ...findSystem(state, "a")!, developments: [dev(0)] });
    expect(developmentUpkeepPerCycle(state)).toBe(0);
    state = replaceSystem(state, { ...findSystem(state, "a")!, developments: [dev(0), dev(1), dev(2)] });
    state = replaceSystem(state, { ...findSystem(state, "b")!, developments: [dev(0)] });
    expect(developmentUpkeepPerCycle(state)).toBe(2);
  });
});

describe("syncSystems", () => {
  it("adds a newly won Planet, drops a lost one with everything stationed there", () => {
    let state = duke([planet("a"), planet("b")]);
    state = replaceSystem(state, { ...findSystem(state, "b")!, fighters: [{ hull: 100 }] });
    const synced = syncSystems(state, [planet("a"), planet("c")], 5);
    expect(synced.systems.map((s) => s.seasonId)).toEqual(["a", "c"]);
    expect(findSystem(synced, "c")?.incursion.arrivesAt).toBeNull();
    expect(syncSystems(synced, [planet("a"), planet("c")], 6)).toBe(synced);
  });
  it("keeps an old slot's share of progress on the new timer (§30), and drops an old Fortify", () => {
    const old = duke([planet("a"), planet("b")]);
    const legacy = {
      ...old,
      systems: [
        { ...old.systems[0]!, slot: { kind: "FIGHTER", label: "Fighter", cost: 40, progress: 30 } },
        { ...old.systems[1]!, slot: { kind: "FORTIFY", label: "Fortify +20", cost: 40, progress: 5, points: 20 } }
      ]
    } as unknown as typeof old;
    const synced = syncSystems(legacy, [planet("a"), planet("b")], 100);
    // 30 of 40 done: a quarter of the 8h left.
    expect(findSystem(synced, "a")?.slot).toMatchObject({ kind: "FIGHTER", startedAt: 100 - 6 * 60 * 60 * 1000, completesAt: 100 + 2 * 60 * 60 * 1000 });
    expect(findSystem(synced, "b")?.slot).toBeNull();
  });
});

