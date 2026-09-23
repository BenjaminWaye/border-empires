import { describe, expect, it } from "vitest";
import { MS_PER_DAY } from "../galaxy-production-queue/galaxy-production-queue.js";
import {
  advanceProduction,
  applyCompletedBuild,
  cancelBuild,
  createDukeState,
  planBuild,
  startPlannedBuild,
  totalDailyProduction
} from "./galaxy-duke-production.js";

const stable = (_: string): number | undefined => 100;

describe("createDukeState (first contact)", () => {
  it("warns of an incursion in 3 days, presents the Court offer once, and starts with nothing built", () => {
    const state = createDukeState("uid-1", 1_000, 5);
    expect(state.incursion.arrivesAt).toBe(1_000 + 3 * MS_PER_DAY);
    expect(state.incursion.lastCreditCycle).toBe(5);
    expect(state.courtOffer).toEqual({ status: "PENDING" });
    expect(state.slot).toBeNull();
    expect(state.fighters).toEqual([]);
    expect(state.digest[0]?.text).toMatch(/Arrival in 3 days/);
  });
});

describe("totalDailyProduction", () => {
  it("sums the §23 daily rates across holdings", () => {
    expect(
      totalDailyProduction([
        { seasonId: "a", tier: "PLANET", specialization: "INDUSTRIAL" },
        { seasonId: "b", tier: "OUTPOST", specialization: "CAPITAL" }
      ])
    ).toBe(6 + 1);
  });
});

describe("planBuild / startPlannedBuild / advanceProduction", () => {
  const fresh = () => createDukeState("uid-1", 0);

  it("prices a Fighter at 80 and a Probe at 25", () => {
    expect(planBuild(fresh(), { kind: "FIGHTER" }, stable)).toEqual({ ok: true, build: { kind: "FIGHTER", label: "Fighter", cost: 80 } });
    expect(planBuild(fresh(), { kind: "PROBE" }, stable)).toMatchObject({ ok: true, build: { cost: 25 } });
  });

  it("a Fighter takes 14 days at 6/day and 40 days at 2/day", () => {
    const build = (rate: number, days: number) => {
      const started = startPlannedBuild(fresh(), { kind: "FIGHTER", label: "Fighter", cost: 80 });
      const almost = advanceProduction(started, rate, (days - 1) * MS_PER_DAY);
      expect(almost.completed).toBeNull();
      return advanceProduction(almost.state, rate, days * MS_PER_DAY).completed;
    };
    expect(build(6, 14)).toMatchObject({ kind: "FIGHTER" });
    expect(build(2, 40)).toMatchObject({ kind: "FIGHTER" });
  });

  it("refuses a second build while the slot is busy", () => {
    const busy = startPlannedBuild(fresh(), { kind: "PROBE", label: "Probe", cost: 25 });
    expect(planBuild(busy, { kind: "FIGHTER" }, stable)).toEqual({ ok: false, code: "SLOT_BUSY" });
  });

  it("an empty slot banks at most one Cycle of Production, and the bank carries into the next build", () => {
    const idle = advanceProduction(fresh(), 6, 30 * MS_PER_DAY).state;
    expect(idle.idleBank).toBe(42);
    const started = startPlannedBuild(idle, { kind: "PROBE", label: "Probe", cost: 25 });
    expect(started.slot?.progress).toBe(25);
    expect(started.idleBank).toBe(17);
  });

  it("leftover time after a build completes goes into the bank", () => {
    const started = startPlannedBuild(fresh(), { kind: "PROBE", label: "Probe", cost: 25 });
    const done = advanceProduction(started, 6, 10 * MS_PER_DAY);
    expect(done.completed).toMatchObject({ kind: "PROBE" });
    expect(done.state.idleBank).toBeCloseTo(60 - 25);
  });

  it("caps Fighters at 5 (counting one away on a raid) and Probe stock at 3", () => {
    const maxed = { ...fresh(), fighters: Array.from({ length: 4 }, () => ({ hull: 100 })), inFlight: { kind: "RAID" as const, seasonId: "x", launchedAt: 0, arrivesAt: 1, fighterHull: 100 } };
    expect(planBuild(maxed, { kind: "FIGHTER" }, stable)).toEqual({ ok: false, code: "FIGHTER_CAP" });
    expect(planBuild({ ...fresh(), probeStock: 3 }, { kind: "PROBE" }, stable)).toEqual({ ok: false, code: "PROBE_STOCK_CAP" });
  });

  it("Fortify costs 2 per point and only for Sectors you hold and points that fit", () => {
    expect(planBuild(fresh(), { kind: "FORTIFY", seasonId: "s", points: 20 }, () => 60)).toMatchObject({ ok: true, build: { cost: 40 } });
    expect(planBuild(fresh(), { kind: "FORTIFY", seasonId: "s", points: 50 }, () => 60)).toEqual({ ok: false, code: "INVALID" });
    expect(planBuild(fresh(), { kind: "FORTIFY", seasonId: "s", points: 5 }, () => undefined)).toEqual({ ok: false, code: "NOT_OWNED" });
  });

  it("Refit is priced by the weakest Fighter's missing hull and refuses when nothing needs repair", () => {
    const hurt = { ...fresh(), fighters: [{ hull: 100 }, { hull: 60 }] };
    expect(planBuild(hurt, { kind: "REFIT" }, stable)).toMatchObject({ ok: true, build: { cost: 32 } });
    expect(planBuild({ ...fresh(), fighters: [{ hull: 100 }] }, { kind: "REFIT" }, stable)).toEqual({ ok: false, code: "NOTHING_TO_REPAIR" });
    expect(planBuild(fresh(), { kind: "REFIT" }, stable)).toEqual({ ok: false, code: "NOTHING_TO_REPAIR" });
  });

  it("cancelling frees the slot", () => {
    expect(cancelBuild(startPlannedBuild(fresh(), { kind: "PROBE", label: "Probe", cost: 25 })).slot).toBeNull();
  });

  it("zero rate does nothing", () => {
    const started = startPlannedBuild(fresh(), { kind: "PROBE", label: "Probe", cost: 25 });
    expect(advanceProduction(started, 0, 5 * MS_PER_DAY).state.slot?.progress).toBe(0);
  });
});

describe("applyCompletedBuild", () => {
  const fresh = () => createDukeState("uid-1", 0);
  it("a Fighter joins at full hull, a Probe joins the stock", () => {
    expect(applyCompletedBuild(fresh(), { kind: "FIGHTER", label: "Fighter", cost: 80, progress: 80 }, 1).state.fighters).toEqual([{ hull: 100 }]);
    expect(applyCompletedBuild(fresh(), { kind: "PROBE", label: "Probe", cost: 25, progress: 25 }, 1).state.probeStock).toBe(1);
  });
  it("Refit restores the most damaged Fighter", () => {
    const hurt = { ...fresh(), fighters: [{ hull: 90 }, { hull: 30 }] };
    const step = applyCompletedBuild(hurt, { kind: "REFIT", label: "Refit", cost: 56, progress: 56 }, 1);
    expect(step.state.fighters).toEqual([{ hull: 90 }, { hull: 100 }]);
  });
  it("Fortify emits a Stability effect for the chosen Sector", () => {
    const step = applyCompletedBuild(fresh(), { kind: "FORTIFY", label: "Fortify +20", cost: 40, progress: 40, seasonId: "s1", points: 20 }, 1);
    expect(step.effects).toEqual([{ kind: "STABILITY_DELTA", seasonId: "s1", delta: 20 }]);
  });
});
