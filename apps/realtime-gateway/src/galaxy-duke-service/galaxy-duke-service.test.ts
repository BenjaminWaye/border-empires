import type { SeasonArchiveRow } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import { InMemoryGalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import { findSystem, replaceSystem } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import { seasonWithBody } from "../galaxy-duke-engine/galaxy-duke-fixtures.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { InMemoryGalaxyDukeStore } from "../galaxy-duke-store/galaxy-duke-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import { InMemoryGalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import { createGalaxyDukeService } from "./galaxy-duke-service.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = 100 * GALAXY_CYCLE_LENGTH_MS;

type Won = { seasonId: string; player: "a" | "b" | "x"; objective?: "TOWN_CONTROL" | "DIPLOMATIC_DOMINANCE" };
const archive = (won: Won, sequence: number): SeasonArchiveRow => ({
  seasonId: won.seasonId,
  seasonSequence: sequence,
  endedAt: 1_000,
  updatedAt: 1_000,
  mostTerritory: [],
  mostPoints: [],
  longestSurvivalMs: [],
  replayEvents: [],
  winner: { playerId: `player-${won.player}`, playerName: won.player, objectiveId: won.objective ?? "TOWN_CONTROL", objectiveName: "x", crownedAt: 1 }
});

const harness = async (planets: Won[] = [{ seasonId: "season-a", player: "a" }, { seasonId: "season-b", player: "b", objective: "DIPLOMATIC_DOMINANCE" }]) => {
  let nowMs = T0;
  const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
  for (const p of ["a", "b", "x"]) await authBindingStore.bindIdentity({ uid: `uid-${p}`, playerId: `player-${p}` });
  const stores = {
    dukeStore: new InMemoryGalaxyDukeStore(),
    galaxyEconomyStore: new InMemoryGalaxyEconomyStore(),
    galaxyBattleLogStore: new InMemoryGalaxyBattleLogStore(),
    galaxyDefenseCampaignStore: new InMemoryGalaxyDefenseCampaignStore(),
    galaxyExplorationStore: new InMemoryGalaxyExplorationStore(),
    galaxyPlanetStore: new InMemoryGalaxyPlanetStore()
  };
  const counters: string[] = [];
  const service = createGalaxyDukeService({
    ...stores,
    authBindingStore,
    listSeasonArchives: async () => planets.map((p, i) => archive(p, i + 1)),
    now: () => nowMs,
    onCounter: (c) => counters.push(c)
  });
  const h = {
    service,
    stores,
    counters,
    advance: (ms: number) => {
      nowMs += ms;
    },
    // Steps the clock in hourly ticks, like the real scheduler.
    run: async (ms: number) => {
      for (let t = 0; t < ms; t += HOUR) {
        nowMs += Math.min(HOUR, ms - t);
        await service.tick();
      }
    },
    stability: async (uid: string, seasonId: string) => (await stores.galaxyEconomyStore.getStability(uid, seasonId))?.stability,
    patch: async (uid: string, fn: (s: DukeState) => DukeState) => {
      const state = await stores.dukeStore.get(uid);
      await stores.dukeStore.put(fn(state!));
    }
  };
  return h;
};

const withSystem = (seasonId: string, patch: Partial<ReturnType<typeof findSystem> & object>) => (s: DukeState): DukeState =>
  replaceSystem(s, { ...findSystem(s, seasonId)!, ...patch });

describe("first contact and the Docket", () => {
  it("a new Duke sees their system, a 3-day warning, the Court's offer, and what needs attention", async () => {
    const h = await harness();
    const status = await h.service.status("uid-a");
    expect(status?.systems).toHaveLength(1);
    expect(status?.systems[0]).toMatchObject({ seasonId: "season-a", ratePerDay: 6, stability: 100, hitsRemaining: 5, incursionArrivesAt: T0 + 3 * DAY, slot: null });
    expect(status?.court).toMatchObject({ start: 300, current: 280, offer: { status: "PENDING" } });
    expect(status?.attention.map((a) => a.kind)).toEqual(["INCURSION_UNDEFENDED", "COURT_OFFER", "SLOT_EMPTY"]);
    expect(status?.digest[0]?.text).toMatch(/Arrival in 3 days/);
  });
  it("an account with no Planet is not a Duke", async () => {
    const h = await harness();
    expect(await h.service.status("uid-x")).toBeUndefined();
    expect(await h.service.build("uid-x", "season-a", { kind: "FIGHTER" })).toEqual({ ok: false, code: "NOT_A_DUKE" });
  });
});

describe("one build slot per planetary system, no weekly gate", () => {
  it("each Planet builds on its own, so a Duke with two Planets builds two things at once", async () => {
    const h = await harness([{ seasonId: "season-a", player: "a" }, { seasonId: "season-c", player: "a" }, { seasonId: "season-b", player: "b" }]);
    expect((await h.service.build("uid-a", "season-a", { kind: "FIGHTER" })).ok).toBe(true);
    expect((await h.service.build("uid-a", "season-c", { kind: "PROBE" })).ok).toBe(true);
    expect(await h.service.build("uid-a", "season-a", { kind: "PROBE" })).toEqual({ ok: false, code: "SLOT_BUSY" });
    const status = await h.service.status("uid-a");
    expect(status?.systems.map((s) => s.slot?.label)).toEqual(["Fighter", "Probe"]);
  });
  it("you cannot build in a system you don't hold", async () => {
    const h = await harness();
    expect(await h.service.build("uid-a", "season-b", { kind: "FIGHTER" })).toEqual({ ok: false, code: "NO_SUCH_SYSTEM" });
  });
  it("cancelling frees the slot and loses the progress", async () => {
    const h = await harness();
    await h.service.build("uid-a", "season-a", { kind: "FIGHTER" });
    expect(await h.service.cancelBuild("uid-a", "season-b")).toMatchObject({ ok: false });
    expect((await h.service.cancelBuild("uid-a", "season-a")).ok).toBe(true);
    expect(await h.service.cancelBuild("uid-a", "season-a")).toEqual({ ok: false, code: "NOTHING_TO_CANCEL" });
  });
  it("the menu says why an option is unavailable", async () => {
    const h = await harness();
    await h.service.build("uid-a", "season-a", { kind: "FIGHTER" });
    const sys = (await h.service.status("uid-a"))?.systems[0];
    expect(sys?.options.find((o) => o.kind === "FIGHTER")).toMatchObject({ cost: 40, daysAtCurrentRate: 7, blockedBy: "SLOT_BUSY" });
    expect(sys?.options.find((o) => o.kind === "REFIT")?.blockedBy).toBe("SLOT_BUSY");
  });
});

describe("developments: press a planet, develop a body", () => {
  it("a Harvester on a gas giant speeds that system's building, and shows on the body", async () => {
    const { seasonId, bodyIndex } = seasonWithBody("GAS_GIANT");
    const h = await harness([{ seasonId, player: "a" }, { seasonId: "season-b", player: "b" }]);
    const before = (await h.service.status("uid-a"))?.systems[0];
    const body = before?.bodies[bodyIndex];
    expect(body).toMatchObject({ kind: "GAS_GIANT", development: null, option: { label: "Gas Harvester", cost: 80, blockedBy: null } });
    expect((await h.service.build("uid-a", seasonId, { kind: "DEVELOP", bodyIndex })).ok).toBe(true);
    await h.run(15 * DAY);
    const after = (await h.service.status("uid-a"))?.systems[0];
    expect(after?.bodies[bodyIndex]).toMatchObject({ development: { label: "Gas Harvester", summary: "+8 Production per Cycle" }, option: null });
    expect(after?.ratePerDay).toBeCloseTo(6 + 8 / 7, 1);
    expect(await h.service.build("uid-a", seasonId, { kind: "DEVELOP", bodyIndex })).toEqual({ ok: false, code: "BODY_ALREADY_DEVELOPED" });
  });
  it("the first development is free; a second one charges 1 Influence a Cycle", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.stores.galaxyEconomyStore.upsertBalance({ authUid: "uid-a", influence: 10, production: 0, lastCycleAt: T0 });
    await h.patch("uid-a", withSystem("season-a", { developments: [{ bodyIndex: 0, kind: "MINING" }] }));
    await h.run(7 * DAY + HOUR);
    expect((await h.stores.galaxyEconomyStore.getBalance("uid-a"))?.influence).toBe(10);
    await h.patch("uid-a", withSystem("season-a", { developments: [{ bodyIndex: 0, kind: "MINING" }, { bodyIndex: 1, kind: "MINING" }] }));
    await h.run(7 * DAY);
    expect((await h.stores.galaxyEconomyStore.getBalance("uid-a"))?.influence).toBe(9);
    expect((await h.service.status("uid-a"))?.economy.developmentUpkeepPerCycle).toBe(1);
  });
});

describe("Wardens are hardest at the start", () => {
  it("a lone Planet with no defence is overrun: five hits in under two weeks and it is contested", async () => {
    const h = await harness([{ seasonId: "season-a", player: "a" }]);
    await h.service.status("uid-a");
    await h.run(14 * DAY);
    expect(await h.stability("uid-a", "season-a")).toBe(0);
    expect(await h.stores.galaxyDefenseCampaignStore.getQueueLength()).toBe(1);
    expect((await h.service.status("uid-a"))?.digest.some((d) => /now contested/.test(d.text))).toBe(true);
  });
  it("the same Planet shares the pool with a second one and is hit half as often", async () => {
    const lone = await harness([{ seasonId: "season-a", player: "a" }]);
    const pair = await harness();
    for (const h of [lone, pair]) {
      await h.service.status("uid-a");
      await h.run(9 * DAY);
    }
    const hits = async (h: Awaited<ReturnType<typeof harness>>) => (100 - ((await h.stability("uid-a", "season-a")) ?? 0)) / 20;
    expect(await hits(lone)).toBeGreaterThan(await hits(pair));
  });
  it("a Court-protected Duke is left alone for 30 days", async () => {
    const h = await harness([{ seasonId: "season-a", player: "a" }]);
    await h.service.status("uid-a");
    expect((await h.service.answerCourtOffer("uid-a", true)).ok).toBe(true);
    await h.run(20 * DAY);
    expect(await h.stability("uid-a", "season-a")).toBe(100);
    expect(h.counters).toContain("duke_incursion_suppressed_by_court");
  });
  it("a Fighter stationed at the system repels incursions and takes the wear", async () => {
    const h = await harness([{ seasonId: "season-a", player: "a" }]);
    await h.service.status("uid-a");
    await h.patch("uid-a", withSystem("season-a", { fighters: [{ hull: 100 }, { hull: 100 }] }));
    await h.run(5 * DAY);
    const sys = (await h.service.status("uid-a"))?.systems[0];
    expect(sys?.stability).toBe(100);
    expect(sys?.fighters.reduce((a, b) => a + b, 0)).toBeLessThan(200);
  });
});

describe("Petition: one per Duke per Cycle", () => {
  it("Move Against the Court spends Influence, lowers Court Strength, lifts Domain Weight; a second one waits a Cycle", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.stores.galaxyEconomyStore.upsertBalance({ authUid: "uid-a", influence: 30, production: 0, lastCycleAt: T0 });
    const before = await h.service.status("uid-a");
    expect(await h.service.moveAgainstCourt("uid-a", 2)).toEqual({ ok: false, code: "INVALID" });
    expect(await h.service.moveAgainstCourt("uid-a", 100)).toEqual({ ok: false, code: "INSUFFICIENT_INFLUENCE" });
    expect((await h.service.moveAgainstCourt("uid-a", 20)).ok).toBe(true);
    const after = await h.service.status("uid-a");
    expect(after?.court.current).toBe((before?.court.current ?? 0) - 4);
    expect(after?.court.myContribution).toBe(20);
    expect(after?.influence).toBe(10);
    expect((after?.meters.domainWeight ?? 0) - (before?.meters.domainWeight ?? 0)).toBeCloseTo(4, 1);
    expect(after?.petition.available).toBe(false);
    expect(await h.service.moveAgainstCourt("uid-a", 5)).toMatchObject({ ok: false, code: "PETITION_ALREADY_MADE_THIS_CYCLE" });
    expect((await h.service.court()).committedInfluence).toBe(20);
  });
  it("accepting the Court's offer locks Move Against the Court", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.stores.galaxyEconomyStore.upsertBalance({ authUid: "uid-a", influence: 50, production: 0, lastCycleAt: T0 });
    await h.service.answerCourtOffer("uid-a", true);
    expect(await h.service.moveAgainstCourt("uid-a", 10)).toEqual({ ok: false, code: "LOCKED_BY_COURT_OFFER" });
    expect(await h.service.answerCourtOffer("uid-a", false)).toEqual({ ok: false, code: "NO_PENDING_OFFER" });
  });
  it("the Court falls when driven to zero and refuses further wagers", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.stores.galaxyEconomyStore.upsertBalance({ authUid: "uid-a", influence: 5000, production: 0, lastCycleAt: T0 });
    expect((await h.service.moveAgainstCourt("uid-a", 1400)).ok).toBe(true);
    expect((await h.service.status("uid-a"))?.court).toMatchObject({ current: 0, fallen: true });
    h.advance(8 * DAY);
    expect(await h.service.moveAgainstCourt("uid-a", 10)).toEqual({ ok: false, code: "COURT_HAS_FALLEN" });
  });
});

describe("Probes and raids launch from a system", () => {
  const seed = async (h: Awaited<ReturnType<typeof harness>>, patch: Partial<NonNullable<ReturnType<typeof findSystem>>>) => {
    await h.service.status("uid-a");
    await h.service.status("uid-b");
    await h.patch("uid-a", withSystem("season-a", patch));
    // Keep the Wardens out of these tests.
    await h.service.answerCourtOffer("uid-a", true);
    await h.service.answerCourtOffer("uid-b", true);
  };

  it("a Probe is consumed, surveys the target, stays in orbit, and reports live changes", async () => {
    const h = await harness();
    await seed(h, { probeStock: 1 });
    expect((await h.service.order("uid-a", "season-a", { kind: "PROBE", targetSeasonId: "season-b" })).ok).toBe(true);
    expect((await h.service.status("uid-a"))?.flights).toMatchObject([{ kind: "PROBE", seasonId: "season-b" }]);
    h.advance(11 * HOUR);
    const arrived = await h.service.status("uid-a");
    expect(arrived?.flights).toEqual([]);
    expect(arrived?.systems[0]?.probeStock).toBe(0);
    expect(arrived?.orbiting).toHaveLength(1);
    expect(arrived?.intel[0]).toMatchObject({ seasonId: "season-b", stability: 100, defenderHull: null, live: true });
    expect((await h.stores.galaxyExplorationStore.getSurveysForOwner("uid-a")).map((s) => s.seasonId)).toEqual(["season-b"]);
    await h.stores.galaxyEconomyStore.setStability("uid-b", "season-b", 60);
    h.advance(HOUR);
    await h.service.tick();
    expect((await h.service.status("uid-a"))?.digest.some((d) => /Probe over .*Stability 100 to 60/.test(d.text))).toBe(true);
  });

  it("can't launch without a Probe, at your own system, or raid an unsurveyed one", async () => {
    const h = await harness();
    await seed(h, {});
    expect(await h.service.order("uid-a", "season-a", { kind: "PROBE", targetSeasonId: "season-b" })).toEqual({ ok: false, code: "NO_PROBE" });
    expect(await h.service.order("uid-a", "season-a", { kind: "RAID", targetSeasonId: "season-b" })).toEqual({ ok: false, code: "NOT_SURVEYED" });
    expect(await h.service.order("uid-a", "season-a", { kind: "PROBE", targetSeasonId: "nope" })).toEqual({ ok: false, code: "INVALID" });
    expect(await h.service.order("uid-a", "season-zzz", { kind: "PROBE", targetSeasonId: "season-b" })).toEqual({ ok: false, code: "NO_SUCH_SYSTEM" });
  });

  it("a raid on an undefended Sector takes a flat 20, is public, and five hits contest it", async () => {
    const h = await harness();
    await seed(h, { fighters: [{ hull: 100 }] });
    await h.patch("uid-a", (s) => ({ ...s, intel: [{ seasonId: "season-b", label: "B", stability: 100, defenderHull: null, at: T0, live: false }] }));
    for (let hit = 1; hit <= 5; hit += 1) {
      expect((await h.service.order("uid-a", "season-a", { kind: "RAID", targetSeasonId: "season-b" })).ok).toBe(true);
      h.advance(13 * HOUR);
      await h.service.tick();
      expect(await h.stability("uid-b", "season-b")).toBe(100 - 20 * hit);
    }
    expect(await h.stores.galaxyDefenseCampaignStore.getQueueLength()).toBe(1);
    expect((await h.stores.galaxyBattleLogStore.listRecent(10)).length).toBe(5);
    expect((await h.service.status("uid-b"))?.digest.some((d) => /contested/.test(d.text))).toBe(true);
    expect((await h.service.status("uid-a"))?.systems[0]?.fighters).toEqual([100]);
  });

  it("a Defending Fighter at the target holds an equal raid: no Stability loss, both damaged", async () => {
    const h = await harness();
    await seed(h, { fighters: [{ hull: 100 }] });
    await h.patch("uid-a", (s) => ({ ...s, intel: [{ seasonId: "season-b", label: "B", stability: 100, defenderHull: 100, at: T0, live: false }] }));
    await h.patch("uid-b", withSystem("season-b", { fighters: [{ hull: 100 }] }));
    await h.service.order("uid-a", "season-a", { kind: "RAID", targetSeasonId: "season-b" });
    h.advance(13 * HOUR);
    await h.service.tick();
    expect(await h.stability("uid-b", "season-b")).toBe(100);
    expect((await h.service.status("uid-b"))?.systems[0]?.fighters).toEqual([60]);
    expect((await h.service.status("uid-a"))?.systems[0]?.fighters).toEqual([60]);
  });
});

describe("robustness", () => {
  it("a stored row from an older build with no per-system state is treated as a new Duke, not a crash", async () => {
    const h = await harness();
    await h.stores.dukeStore.put({ authUid: "uid-a", createdAt: 0, lastAdvancedAt: 0 } as unknown as DukeState);
    const status = await h.service.status("uid-a");
    expect(status?.systems).toHaveLength(1);
  });
});

describe("concurrency", () => {
  it("two Dukes whose raids land on each other at the same moment do not deadlock", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.service.status("uid-b");
    await h.service.answerCourtOffer("uid-a", true);
    await h.service.answerCourtOffer("uid-b", true);
    const raid = (from: string, to: string) => ({ kind: "RAID" as const, fromSeasonId: from, seasonId: to, launchedAt: T0 - 13 * HOUR, arrivesAt: T0, fighterHull: 100 });
    await h.patch("uid-a", (s) => ({ ...s, flights: [raid("season-a", "season-b")] }));
    await h.patch("uid-b", (s) => ({ ...s, flights: [raid("season-b", "season-a")] }));
    const both = Promise.all([h.service.status("uid-a"), h.service.status("uid-b")]);
    const winner = await Promise.race([both.then(() => "done"), new Promise((r) => setTimeout(() => r("deadlock"), 2_000))]);
    expect(winner).toBe("done");
    // Both raids resolved, one after the other: the first attacker's Fighter is
    // back home by the time the second raid lands, and defends.
    expect((await h.stores.dukeStore.get("uid-a"))?.flights).toEqual([]);
    expect((await h.stores.dukeStore.get("uid-b"))?.flights).toEqual([]);
    expect((await h.stores.galaxyBattleLogStore.listRecent(10)).length).toBe(2);
  });
});

describe("Convergence: the Court falls, an era ends (§27)", () => {
  const fallCourt = async (h: Awaited<ReturnType<typeof harness>>) => {
    await h.service.status("uid-a");
    await h.service.status("uid-b");
    await h.stores.galaxyEconomyStore.upsertBalance({ authUid: "uid-a", influence: 5000, production: 0, lastCycleAt: T0 });
    await h.stores.galaxyPlanetStore.christen({ seasonId: "season-a", ownerAuthUid: "uid-a", planetName: "Aurelia" });
    expect((await h.service.moveAgainstCourt("uid-a", 1400)).ok).toBe(true);
  };

  it("the top Domain Weight takes the throne, the era is recorded, and the Court is full again", async () => {
    const h = await harness();
    await fallCourt(h);
    await h.service.tick();
    const hall = await h.stores.dukeStore.getHallOfFame();
    expect(hall).toHaveLength(1);
    expect(hall[0]).toMatchObject({ era: 1, emperorAuthUid: "uid-a" });
    expect(hall[0]!.standings.map((s) => s.authUid)).toEqual(["uid-a", "uid-b"]);
    const status = await h.service.status("uid-a");
    expect(status?.court).toMatchObject({ era: 2, fallen: false, current: 300, committedInfluence: 0, isEmperor: true });
    expect(status?.court.hallOfFame).toHaveLength(1);
    expect((await h.service.status("uid-b"))?.court.isEmperor).toBe(false);
  });

  it("tells every Duke in their Log, and only once however often the tick runs", async () => {
    const h = await harness();
    await fallCourt(h);
    await h.service.tick();
    await h.service.tick();
    await h.service.tick();
    expect(await h.stores.dukeStore.getHallOfFame()).toHaveLength(1);
    for (const uid of ["uid-a", "uid-b"]) {
      const lines = ((await h.service.status(uid))?.digest ?? []).filter((d) => d.text.includes("takes the throne") || d.text.includes("take the throne"));
      expect(lines).toHaveLength(1);
    }
    expect(((await h.service.status("uid-a"))?.digest ?? []).find((d) => d.text.includes("take the throne"))?.text).toContain("You take the throne");
  });

  it("wagering works again in the new era", async () => {
    const h = await harness();
    await fallCourt(h);
    await h.service.tick();
    h.advance(8 * DAY);
    expect((await h.service.moveAgainstCourt("uid-a", 20)).ok).toBe(true);
    expect((await h.service.status("uid-a"))?.court).toMatchObject({ era: 2, current: 296 });
  });

  it("does nothing while the Court stands", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.service.tick();
    expect(await h.stores.dukeStore.getHallOfFame()).toEqual([]);
    expect((await h.service.status("uid-a"))?.court.era).toBe(1);
  });
});
