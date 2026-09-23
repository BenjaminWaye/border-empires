import { describe, expect, it } from "vitest";
import { createDukeState } from "./galaxy-duke-production.js";
import { MAX_INTEL } from "./galaxy-duke-config.js";
import { arriveProbe, derelictRoll, launchProbe, launchRaid, refreshOrbitIntel, resolveRaidArrival } from "./galaxy-duke-orders.js";
import type { DukeState } from "./galaxy-duke-types.js";

const base = (extra: Partial<DukeState> = {}): DukeState => ({ ...createDukeState("uid-a", 0), ...extra });
const view = (seasonId: string, stability = 80, defenderHull: number | null = null) => ({ seasonId, label: seasonId, stability, defenderHull });

describe("launchProbe", () => {
  it("consumes a Probe from stock and puts it in flight for about 10 hours", () => {
    const res = launchProbe(base({ probeStock: 1 }), "kel", new Set(), 0);
    expect(res.ok && res.state.probeStock).toBe(0);
    expect(res.ok && res.state.inFlight?.arrivesAt).toBe(Math.round((2 * 24 * 60 * 60 * 1000) / 5));
  });
  it("needs a Probe, a free order, and a foreign target", () => {
    expect(launchProbe(base(), "kel", new Set(), 0)).toEqual({ ok: false, code: "NO_PROBE" });
    expect(launchProbe(base({ probeStock: 1 }), "mine", new Set(["mine"]), 0)).toEqual({ ok: false, code: "OWN_SECTOR" });
    const busy = base({ probeStock: 1, inFlight: { kind: "PROBE", seasonId: "x", launchedAt: 0, arrivesAt: 9 } });
    expect(launchProbe(busy, "kel", new Set(), 0)).toEqual({ ok: false, code: "ORDER_IN_FLIGHT" });
  });
});

describe("arriveProbe", () => {
  it("Surveys the system, records live intel, and leaves the Probe in orbit", () => {
    const step = arriveProbe(base({ inFlight: { kind: "PROBE", seasonId: "kel", launchedAt: 0, arrivesAt: 1 } }), view("kel", 80, 60), 5);
    expect(step.state.inFlight).toBeNull();
    expect(step.state.orbiting).toEqual([{ seasonId: "kel", arrivedAt: 5 }]);
    expect(step.state.intel[0]).toMatchObject({ seasonId: "kel", stability: 80, defenderHull: 60, live: true, at: 5 });
    expect(step.state.digest.at(-1)?.text).toMatch(/now in orbit.*Stability 80.*hull 60%/);
  });
  it("orbits at most 3 Probes; a fourth retires the oldest to a dated snapshot", () => {
    let state = base();
    const counters: string[] = [];
    for (const [i, id] of ["a", "b", "c", "d"].entries()) {
      const step = arriveProbe(state, view(id), 10 + i);
      state = step.state;
      counters.push(...step.counters);
    }
    expect(state.orbiting.map((o) => o.seasonId)).toEqual(["b", "c", "d"]);
    expect(state.intel.find((i) => i.seasonId === "a")?.live).toBe(false);
    expect(state.intel.find((i) => i.seasonId === "d")?.live).toBe(true);
    expect(counters).toContain("duke_probe_orbit_retired");
  });
  it("re-probing an orbited system does not consume a second orbit slot", () => {
    let state = arriveProbe(base(), view("a"), 1).state;
    state = arriveProbe(state, view("a", 60), 2).state;
    expect(state.orbiting).toHaveLength(1);
    expect(state.intel).toHaveLength(1);
  });
  it("the intel store is hard-capped", () => {
    let state = base();
    let evicted = 0;
    for (let i = 0; i < MAX_INTEL + 5; i += 1) {
      const step = arriveProbe(state, view(`s${i}`), i);
      state = step.state;
      evicted += step.counters.filter((c) => c === "duke_intel_evicted").length;
    }
    expect(state.intel.length).toBe(MAX_INTEL);
    expect(evicted).toBe(5);
  });
  it("derelicts are deterministic and roughly 8% of systems", () => {
    expect(derelictRoll("u", "s1")).toEqual(derelictRoll("u", "s1"));
    const found = Array.from({ length: 2000 }, (_, i) => derelictRoll("u", `s${i}`)).filter((r) => r.found).length;
    expect(found).toBeGreaterThan(90);
    expect(found).toBeLessThan(230);
  });
});

describe("live intel refresh", () => {
  it("reports a change once and updates the stored numbers", () => {
    let state = arriveProbe(base(), view("kel", 80, 100), 1).state;
    const step = refreshOrbitIntel(state, () => view("kel", 60, 40), 9);
    expect(step.state.digest.at(-1)?.text).toBe("Probe over kel: Stability 80 to 60; defended by a Fighter (hull 40%).");
    const again = refreshOrbitIntel(step.state, () => view("kel", 60, 40), 10);
    expect(again.state.digest).toHaveLength(step.state.digest.length);
  });
  it("a retired Probe no longer reports", () => {
    let state = base();
    for (const id of ["a", "b", "c", "d"]) state = arriveProbe(state, view(id), 1).state;
    const step = refreshOrbitIntel(state, (id) => view(id, 10), 5);
    expect(step.state.digest.filter((d) => d.text.startsWith("Probe over a")).length).toBe(0);
  });
});

describe("launchRaid / resolveRaidArrival", () => {
  const surveyed = () => arriveProbe(base({ fighters: [{ hull: 100 }, { hull: 70 }] }), view("kel"), 1).state;
  it("needs a Surveyed target, a Fighter and a free order; sends the healthiest", () => {
    expect(launchRaid(base({ fighters: [{ hull: 100 }] }), "kel", new Set(), 0)).toEqual({ ok: false, code: "NOT_SURVEYED" });
    expect(launchRaid(base({ fighters: [] }), "kel", new Set(), 0)).toMatchObject({ ok: false });
    const res = launchRaid(surveyed(), "kel", new Set(), 10);
    expect(res.ok && res.state.inFlight).toMatchObject({ kind: "RAID", fighterHull: 100 });
    expect(res.ok && res.state.fighters).toEqual([{ hull: 70 }]);
  });
  it("against an undefended Sector the raid takes a flat 20 and the Fighter returns unharmed", () => {
    const sent = launchRaid(surveyed(), "kel", new Set(), 10);
    if (!sent.ok) throw new Error("expected ok");
    const step = resolveRaidArrival(sent.state, null, { seasonId: "kel", label: "Kel", stability: 100 }, 99);
    expect(step.targetStabilityDelta).toBe(-20);
    expect(step.attacker.fighters).toEqual([{ hull: 70 }, { hull: 100 }]);
    expect(step.attacker.inFlight).toBeNull();
  });
  it("a defender holds an equal raid: no Stability loss, both damaged, both told", () => {
    const sent = launchRaid(surveyed(), "kel", new Set(), 10);
    if (!sent.ok) throw new Error("expected ok");
    const defender = base({ authUid: "kel-uid", fighters: [{ hull: 100 }] });
    const step = resolveRaidArrival(sent.state, defender, { seasonId: "kel", label: "Kel", stability: 100 }, 99);
    expect(step.targetStabilityDelta).toBe(0);
    expect(step.defender?.fighters).toEqual([{ hull: 60 }]);
    expect(step.attacker.fighters).toContainEqual({ hull: 60 });
    expect(step.defender?.digest.at(-1)?.text).toMatch(/held off/);
  });
});
