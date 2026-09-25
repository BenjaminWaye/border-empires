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

describe("systemDailyRate", () => {
  it("is the Planet's own rate, plus Harvesters and Mining Stations", () => {
    const base = findSystem(duke(), "s1")!;
    expect(systemDailyRate(base)).toBe(6);
    const grown = { ...base, developments: [{ bodyIndex: 0, kind: "HARVESTER" as const }, { bodyIndex: 1, kind: "MINING" as const }] };
    expect(systemDailyRate(grown)).toBeCloseTo(6 + 8 / 7 + 5 / 7);
    expect(systemDailyRate({ ...base, developments: [{ bodyIndex: 0, kind: "CRYO" as const }] })).toBe(6);
    expect(systemDailyRate(findSystem(duke([planet("s1", "CAPITAL")]), "s1")!)).toBe(2);
  });
});

describe("planBuild", () => {
  it("prices a Fighter at 40 and a Probe at 25", () => {
    expect(planBuild(duke(), "s1", { kind: "FIGHTER" }, 100)).toEqual({ ok: true, build: { kind: "FIGHTER", label: "Fighter", cost: 40 } });
    expect(planBuild(duke(), "s1", { kind: "PROBE" }, 100)).toMatchObject({ ok: true, build: { cost: 25 } });
  });
  it("each system has its own slot: one busy system does not block another", () => {
    let state = duke([planet("a"), planet("b")]);
    state = startPlannedBuild(state, "a", { kind: "PROBE", label: "Probe", cost: 25 });
    expect(planBuild(state, "a", { kind: "FIGHTER" }, 100)).toEqual({ ok: false, code: "SLOT_BUSY" });
    expect(planBuild(state, "b", { kind: "FIGHTER" }, 100).ok).toBe(true);
    expect(planBuild(state, "zzz", { kind: "FIGHTER" }, 100)).toEqual({ ok: false, code: "NO_SUCH_SYSTEM" });
  });
  it("develops a body by its kind: Harvester on a gas giant, Mining on a belt, Cryo on an ice moon", () => {
    const cases = [
      ["GAS_GIANT", "Gas Harvester", 80],
      ["ASTEROID_BELT", "Mining Station", 50],
      ["ICE_MOON", "Cryo Refinery", 70]
    ] as const;
    for (const [kind, label, cost] of cases) {
      const { seasonId, bodyIndex } = seasonWithBody(kind);
      const plan = planBuild(duke([planet(seasonId)]), seasonId, { kind: "DEVELOP", bodyIndex }, 100);
      expect(plan).toMatchObject({ ok: true, build: { kind: "DEVELOP", label, cost, bodyIndex } });
    }
  });
  it("refuses a body that doesn't exist or is already developed", () => {
    const { seasonId, bodyIndex } = seasonWithBody("GAS_GIANT");
    const state = duke([planet(seasonId)]);
    expect(planBuild(state, seasonId, { kind: "DEVELOP", bodyIndex: 99 }, 100)).toEqual({ ok: false, code: "NO_SUCH_BODY" });
    expect(planBuild(state, seasonId, { kind: "DEVELOP", bodyIndex: -1 }, 100)).toEqual({ ok: false, code: "NO_SUCH_BODY" });
    const developed = replaceSystem(state, { ...findSystem(state, seasonId)!, developments: [{ bodyIndex, kind: "HARVESTER" }] });
    expect(planBuild(developed, seasonId, { kind: "DEVELOP", bodyIndex }, 100)).toEqual({ ok: false, code: "BODY_ALREADY_DEVELOPED" });
  });
  it("caps Fighters at 3 per system, counting one away on a raid, and Probes at 3", () => {
    let state = duke();
    state = replaceSystem(state, { ...findSystem(state, "s1")!, fighters: [{ hull: 100 }, { hull: 100 }] });
    state = { ...state, flights: [{ kind: "RAID", fromSeasonId: "s1", seasonId: "x", launchedAt: 0, arrivesAt: 1, fighterHull: 100 }] };
    expect(planBuild(state, "s1", { kind: "FIGHTER" }, 100)).toEqual({ ok: false, code: "FIGHTER_CAP" });
    expect(planBuild(replaceSystem(duke(), { ...findSystem(duke(), "s1")!, probeStock: 3 }), "s1", { kind: "PROBE" }, 100)).toEqual({ ok: false, code: "PROBE_STOCK_CAP" });
  });
  it("Fortify costs 2 per point and only for points that fit", () => {
    expect(planBuild(duke(), "s1", { kind: "FORTIFY", points: 20 }, 60)).toMatchObject({ ok: true, build: { cost: 40 } });
    expect(planBuild(duke(), "s1", { kind: "FORTIFY", points: 50 }, 60)).toEqual({ ok: false, code: "INVALID" });
    expect(planBuild(duke(), "s1", { kind: "FORTIFY", points: 0 }, 60)).toEqual({ ok: false, code: "INVALID" });
  });
  it("Refit is priced by the weakest Fighter and refuses when nothing needs repair", () => {
    const hurt = replaceSystem(duke(), { ...findSystem(duke(), "s1")!, fighters: [{ hull: 100 }, { hull: 60 }] });
    expect(planBuild(hurt, "s1", { kind: "REFIT" }, 100)).toMatchObject({ ok: true, build: { cost: 16 } });
    expect(planBuild(duke(), "s1", { kind: "REFIT" }, 100)).toEqual({ ok: false, code: "NOTHING_TO_REPAIR" });
  });
});

describe("advanceSystem", () => {
  const started = () => startPlannedBuild(duke(), "s1", { kind: "FIGHTER", label: "Fighter", cost: 40 });
  it("a Fighter takes 7 days at 6/day and 20 at 2/day", () => {
    const at6 = findSystem(started(), "s1")!;
    expect(advanceSystem(at6, 6 * MS_PER_DAY).completed).toBeNull();
    expect(advanceSystem(at6, 7 * MS_PER_DAY).completed).toMatchObject({ kind: "FIGHTER" });
    const at2 = findSystem(startPlannedBuild(duke([planet("s1", "CAPITAL")]), "s1", { kind: "FIGHTER", label: "Fighter", cost: 40 }), "s1")!;
    expect(advanceSystem(at2, 19 * MS_PER_DAY).completed).toBeNull();
    expect(advanceSystem(at2, 20 * MS_PER_DAY).completed).toMatchObject({ kind: "FIGHTER" });
  });
  it("a developed system builds faster: the Harvester pays for itself", () => {
    // A dearer build, so neither system finishes inside the week being compared.
    const base = findSystem(startPlannedBuild(duke(), "s1", { kind: "DEVELOP", label: "Gas Harvester", cost: 80, bodyIndex: 0, development: "HARVESTER" }), "s1")!;
    const grown = { ...base, developments: [{ bodyIndex: 0, kind: "HARVESTER" as const }] };
    const progress = (s: typeof base) => advanceSystem(s, 7 * MS_PER_DAY).system.slot!.progress;
    expect(progress(grown)).toBeGreaterThan(progress(base));
    expect(progress(grown) - progress(base)).toBeCloseTo(8);
  });
  it("an empty slot banks at most one Cycle, and the bank carries into the next build", () => {
    const idle = advanceSystem(findSystem(duke(), "s1")!, 30 * MS_PER_DAY).system;
    expect(idle.idleBank).toBe(42);
    const state = startPlannedBuild(replaceSystem(duke(), idle), "s1", { kind: "PROBE", label: "Probe", cost: 25 });
    expect(findSystem(state, "s1")).toMatchObject({ slot: { progress: 25 }, idleBank: 17 });
  });
  it("leftover time after a build completes goes into the bank; a slot with no rate does nothing", () => {
    const done = advanceSystem(findSystem(startPlannedBuild(duke(), "s1", { kind: "PROBE", label: "Probe", cost: 25 }), "s1")!, 10 * MS_PER_DAY);
    expect(done.completed).toMatchObject({ kind: "PROBE" });
    expect(done.system.idleBank).toBeCloseTo(60 - 25);
    expect(cancelBuild(started(), "s1").systems[0]?.slot).toBeNull();
  });
});

describe("applyCompletedBuild", () => {
  it("a Fighter joins its own system at full hull; a Probe joins that system's stock", () => {
    const state = duke([planet("a"), planet("b")]);
    const f = applyCompletedBuild(state, "a", { kind: "FIGHTER", label: "Fighter", cost: 40, progress: 40 }, 1).state;
    expect(findSystem(f, "a")?.fighters).toEqual([{ hull: 100 }]);
    expect(findSystem(f, "b")?.fighters).toEqual([]);
    expect(findSystem(applyCompletedBuild(state, "b", { kind: "PROBE", label: "Probe", cost: 25, progress: 25 }, 1).state, "b")?.probeStock).toBe(1);
  });
  it("a development is recorded on its body and announced with its effect", () => {
    const { seasonId, bodyIndex } = seasonWithBody("GAS_GIANT");
    const step = applyCompletedBuild(duke([planet(seasonId)]), seasonId, { kind: "DEVELOP", label: "Gas Harvester", cost: 80, progress: 80, bodyIndex, development: "HARVESTER" }, 1);
    expect(findSystem(step.state, seasonId)?.developments).toEqual([{ bodyIndex, kind: "HARVESTER" }]);
    expect(step.state.digest.at(-1)?.text).toBe("Gas Harvester online: +8 Production per Cycle.");
  });
  it("Refit restores the most damaged Fighter; Fortify emits a Stability effect for that system", () => {
    const hurt = replaceSystem(duke(), { ...findSystem(duke(), "s1")!, fighters: [{ hull: 90 }, { hull: 30 }] });
    expect(findSystem(applyCompletedBuild(hurt, "s1", { kind: "REFIT", label: "Refit", cost: 56, progress: 56 }, 1).state, "s1")?.fighters).toEqual([{ hull: 90 }, { hull: 100 }]);
    expect(applyCompletedBuild(duke(), "s1", { kind: "FORTIFY", label: "Fortify +20", cost: 40, progress: 40, points: 20 }, 1).effects).toEqual([{ kind: "STABILITY_DELTA", seasonId: "s1", delta: 20 }]);
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
});
