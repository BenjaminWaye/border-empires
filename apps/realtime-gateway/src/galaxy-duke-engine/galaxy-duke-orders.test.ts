import { describe, expect, it } from "vitest";
import { MAX_FLIGHTS, MAX_INTEL } from "./galaxy-duke-config.js";
import { arriveProbe, arrivedFlights, derelictRoll, launchProbe, launchRaid, refreshOrbitIntel, resolveRaidArrival } from "./galaxy-duke-orders.js";
import { findSystem, replaceSystem } from "./galaxy-duke-systems.js";
import { duke, planet } from "./galaxy-duke-fixtures.js";
import type { DukeState, InFlightOrder } from "./galaxy-duke-types.js";

const view = (seasonId: string, stability = 80, defenderHull: number | null = null) => ({ seasonId, label: seasonId, stability, defenderHull });
const stocked = (probeStock = 1, fighters = [{ hull: 100 }]): DukeState => {
  const base = duke();
  return replaceSystem(base, { ...findSystem(base, "s1")!, probeStock, fighters });
};
const probeFlight = (target: string): InFlightOrder => ({ kind: "PROBE", fromSeasonId: "s1", seasonId: target, launchedAt: 0, arrivesAt: 1 });

describe("launchProbe", () => {
  it("consumes a Probe from that system's stock and puts it in flight for about 10 hours", () => {
    const res = launchProbe(stocked(), "s1", "kel", new Set(), 0);
    expect(res.ok && findSystem(res.state, "s1")?.probeStock).toBe(0);
    expect(res.ok && res.state.flights[0]?.arrivesAt).toBe(Math.round((2 * 24 * 60 * 60 * 1000) / 5));
  });
  it("needs a Probe in that system, a foreign target and a free flight slot", () => {
    expect(launchProbe(stocked(0), "s1", "kel", new Set(), 0)).toEqual({ ok: false, code: "NO_PROBE" });
    expect(launchProbe(stocked(), "s1", "mine", new Set(["mine"]), 0)).toEqual({ ok: false, code: "OWN_SECTOR" });
    expect(launchProbe(stocked(), "nowhere", "kel", new Set(), 0)).toEqual({ ok: false, code: "NO_SUCH_SYSTEM" });
    const full = { ...stocked(), flights: Array.from({ length: MAX_FLIGHTS }, (_, i) => probeFlight(`t${i}`)) };
    expect(launchProbe(full, "s1", "kel", new Set(), 0)).toEqual({ ok: false, code: "TOO_MANY_FLIGHTS" });
  });
  it("several Probes can be in flight at once", () => {
    let state = stocked(2);
    for (const t of ["a", "b"]) {
      const res = launchProbe(state, "s1", t, new Set(), 0);
      if (!res.ok) throw new Error("expected ok");
      state = res.state;
    }
    expect(state.flights).toHaveLength(2);
  });
});

describe("arriveProbe", () => {
  it("Surveys the system, records live intel, and leaves the Probe in orbit", () => {
    const flight = probeFlight("kel");
    const step = arriveProbe({ ...stocked(), flights: [flight] }, flight, view("kel", 80, 60), 5);
    expect(step.state.flights).toEqual([]);
    expect(step.state.orbiting).toEqual([{ seasonId: "kel", arrivedAt: 5 }]);
    expect(step.state.intel[0]).toMatchObject({ seasonId: "kel", stability: 80, defenderHull: 60, live: true, at: 5 });
    expect(step.state.digest.at(-1)?.text).toMatch(/now in orbit.*Stability 80.*hull 60%/);
  });
  it("orbits at most 3 Probes; a fourth retires the oldest to a dated snapshot", () => {
    let state = stocked();
    const counters: string[] = [];
    for (const [i, id] of ["a", "b", "c", "d"].entries()) {
      const step = arriveProbe(state, probeFlight(id), view(id), 10 + i);
      state = step.state;
      counters.push(...step.counters);
    }
    expect(state.orbiting.map((o) => o.seasonId)).toEqual(["b", "c", "d"]);
    expect(state.intel.find((i) => i.seasonId === "a")?.live).toBe(false);
    expect(state.intel.find((i) => i.seasonId === "d")?.live).toBe(true);
    expect(counters).toContain("duke_probe_orbit_retired");
  });
  it("re-probing an orbited system does not consume a second orbit slot", () => {
    let state = arriveProbe(stocked(), probeFlight("a"), view("a"), 1).state;
    state = arriveProbe(state, probeFlight("a"), view("a", 60), 2).state;
    expect(state.orbiting).toHaveLength(1);
    expect(state.intel).toHaveLength(1);
  });
  it("the intel store is hard-capped", () => {
    let state = stocked();
    let evicted = 0;
    for (let i = 0; i < MAX_INTEL + 5; i += 1) {
      const step = arriveProbe(state, probeFlight(`s${i}`), view(`s${i}`), i);
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
  it("arrivedFlights only returns orders whose time has come", () => {
    const state = { ...stocked(), flights: [{ ...probeFlight("a"), arrivesAt: 100 }, { ...probeFlight("b"), arrivesAt: 200 }] };
    expect(arrivedFlights(state, 150).map((f) => f.seasonId)).toEqual(["a"]);
  });
});

describe("live intel refresh", () => {
  it("reports a change once and updates the stored numbers", () => {
    const state = arriveProbe(stocked(), probeFlight("kel"), view("kel", 80, 100), 1).state;
    const step = refreshOrbitIntel(state, () => view("kel", 60, 40), 9);
    expect(step.state.digest.at(-1)?.text).toBe("Probe over kel: Stability 80 to 60; defended by a Fighter (hull 40%).");
    expect(refreshOrbitIntel(step.state, () => view("kel", 60, 40), 10).state.digest).toHaveLength(step.state.digest.length);
  });
  it("a retired Probe no longer reports", () => {
    let state = stocked();
    for (const id of ["a", "b", "c", "d"]) state = arriveProbe(state, probeFlight(id), view(id), 1).state;
    const step = refreshOrbitIntel(state, (id) => view(id, 10), 5);
    expect(step.state.digest.filter((d) => d.text.startsWith("Probe over a")).length).toBe(0);
  });
});

describe("launchRaid / resolveRaidArrival", () => {
  const surveyed = (): DukeState => arriveProbe(stocked(0, [{ hull: 100 }, { hull: 70 }]), probeFlight("kel"), view("kel"), 1).state;
  it("needs a Surveyed target and a Fighter in that system; sends the healthiest and removes it from the system", () => {
    expect(launchRaid(stocked(), "s1", "kel", new Set(), 0)).toEqual({ ok: false, code: "NOT_SURVEYED" });
    expect(launchRaid({ ...surveyed(), systems: [{ ...surveyed().systems[0]!, fighters: [] }] }, "s1", "kel", new Set(), 0)).toEqual({ ok: false, code: "NO_FIGHTER" });
    const res = launchRaid(surveyed(), "s1", "kel", new Set(), 10);
    expect(res.ok && res.state.flights[0]).toMatchObject({ kind: "RAID", fighterHull: 100, fromSeasonId: "s1" });
    expect(res.ok && findSystem(res.state, "s1")?.fighters).toEqual([{ hull: 70 }]);
  });
  it("against an undefended Sector the raid takes a flat 20 and the Fighter returns home unharmed", () => {
    const sent = launchRaid(surveyed(), "s1", "kel", new Set(), 10);
    if (!sent.ok) throw new Error("expected ok");
    const step = resolveRaidArrival(sent.state, null, sent.state.flights[0]!, { seasonId: "kel", label: "Kel", stability: 100 }, 99);
    expect(step.targetStabilityDelta).toBe(-20);
    expect(findSystem(step.attacker, "s1")?.fighters).toEqual([{ hull: 70 }, { hull: 100 }]);
    expect(step.attacker.flights).toEqual([]);
  });
  it("a defender in that system holds an equal raid: no Stability loss, both damaged, both told", () => {
    const sent = launchRaid(surveyed(), "s1", "kel", new Set(), 10);
    if (!sent.ok) throw new Error("expected ok");
    const defender = replaceSystem(duke([planet("kel")], 0, "uid-b"), { ...duke([planet("kel")]).systems[0]!, seasonId: "kel", fighters: [{ hull: 100 }] });
    const step = resolveRaidArrival(sent.state, defender, sent.state.flights[0]!, { seasonId: "kel", label: "Kel", stability: 100 }, 99);
    expect(step.targetStabilityDelta).toBe(0);
    expect(findSystem(step.defender!, "kel")?.fighters).toEqual([{ hull: 60 }]);
    expect(findSystem(step.attacker, "s1")?.fighters).toContainEqual({ hull: 60 });
    expect(step.defender?.digest.at(-1)?.text).toMatch(/held off/);
  });
  it("a Fighter whose home system was lost in the meantime is not returned anywhere", () => {
    const sent = launchRaid(surveyed(), "s1", "kel", new Set(), 10);
    if (!sent.ok) throw new Error("expected ok");
    const homeless = { ...sent.state, systems: [] };
    expect(() => resolveRaidArrival(homeless, null, sent.state.flights[0]!, { seasonId: "kel", label: "Kel", stability: 100 }, 99)).not.toThrow();
  });
});
