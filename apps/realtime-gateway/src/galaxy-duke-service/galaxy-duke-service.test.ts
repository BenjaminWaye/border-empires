import type { SeasonArchiveRow } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import { InMemoryGalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import { InMemoryGalaxyDukeStore } from "../galaxy-duke-store/galaxy-duke-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";
import { InMemoryGalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";
import { createGalaxyDukeService } from "./galaxy-duke-service.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = 100 * GALAXY_CYCLE_LENGTH_MS;

const archive = (seasonId: string, playerId: string, objectiveId: "TOWN_CONTROL" | "DIPLOMATIC_DOMINANCE", sequence: number): SeasonArchiveRow => ({
  seasonId,
  seasonSequence: sequence,
  endedAt: 1_000,
  updatedAt: 1_000,
  mostTerritory: [],
  mostPoints: [],
  longestSurvivalMs: [],
  replayEvents: [],
  winner: { playerId, playerName: playerId, objectiveId, objectiveName: objectiveId, crownedAt: 1 }
});

const harness = async (opts: { dukes?: 1 | 2 } = {}) => {
  let nowMs = T0;
  const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
  await authBindingStore.bindIdentity({ uid: "uid-a", playerId: "player-a" });
  await authBindingStore.bindIdentity({ uid: "uid-b", playerId: "player-b" });
  await authBindingStore.bindIdentity({ uid: "uid-x", playerId: "player-x" });
  const archives = [archive("season-a", "player-a", "TOWN_CONTROL", 1)];
  if ((opts.dukes ?? 2) === 2) archives.push(archive("season-b", "player-b", "DIPLOMATIC_DOMINANCE", 2));
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
    listSeasonArchives: async () => archives,
    now: () => nowMs,
    onCounter: (c) => counters.push(c)
  });
  return {
    service,
    stores,
    counters,
    advance: (ms: number) => {
      nowMs += ms;
    },
    stability: async (uid: string, seasonId: string) => (await stores.galaxyEconomyStore.getStability(uid, seasonId))?.stability
  };
};

describe("galaxy duke service", () => {
  it("first status: an Industrial Duke gets first contact, the Court offer, 6/day, a free action and a rank", async () => {
    const h = await harness();
    const status = await h.service.status("uid-a");
    expect(status?.production.ratePerDay).toBe(6);
    expect(status?.docket.incursionArrivesAt).toBe(T0 + 3 * DAY);
    expect(status?.court.offer.status).toBe("PENDING");
    expect(status?.gate).toMatchObject({ available: true, availableAt: null });
    expect(status?.court).toMatchObject({ start: 300, current: 280, capturedSectors: 2 });
    expect(status?.meters).toMatchObject({ dukeCount: 2, sectors: [{ seasonId: "season-a", stability: 100, hitsRemaining: 5 }] });
    expect(status?.digest[0]?.text).toMatch(/Arrival in 3 days/);
  });

  it("an account with no Planet is not a Duke", async () => {
    const h = await harness();
    expect(await h.service.status("uid-x")).toBeUndefined();
    expect(await h.service.invest("uid-x", { kind: "FIGHTER" })).toEqual({ ok: false, code: "NOT_A_DUKE" });
  });

  it("one gated action per Cycle: a second Invest is refused with when it frees up, a rejected plan costs nothing", async () => {
    const h = await harness();
    expect((await h.service.invest("uid-a", { kind: "FIGHTER" })).ok).toBe(true);
    h.advance(1 * DAY);
    const second = await h.service.invest("uid-a", { kind: "PROBE" });
    expect(second).toEqual({ ok: false, code: "SLOT_BUSY" });
    h.advance(1 * DAY);
    expect(await h.service.cancelBuild("uid-a")).toEqual({ ok: false, code: "ACTION_ALREADY_TAKEN_THIS_CYCLE", availableAt: T0 + 7 * DAY });
    h.advance(5 * DAY);
    expect((await h.service.cancelBuild("uid-a")).ok).toBe(true);
  });

  it("the lone-Duke story: undefended hits, then a Fighter repels the next incursion", async () => {
    const h = await harness({ dukes: 1 });
    await h.service.invest("uid-a", { kind: "FIGHTER" });
    // Day 3: the scripted first-contact incursion lands undefended.
    h.advance(3 * DAY + HOUR);
    await h.service.tick();
    expect(await h.stability("uid-a", "season-a")).toBe(80);
    // Day 7: the next Cycle begins, the tick notices, and a warning starts (arrives day 10).
    h.advance(4 * DAY - HOUR + 2 * HOUR);
    await h.service.tick();
    h.advance(3 * DAY + HOUR);
    await h.service.tick();
    expect(await h.stability("uid-a", "season-a")).toBe(60);
    // Day 14: the Fighter (80 Production at 6/day) is finished; the next Cycle's warning starts.
    h.advance(4 * DAY - 3 * HOUR);
    await h.service.tick();
    expect((await h.service.status("uid-a"))?.ships.fighterHulls).toEqual([100]);
    // Day 17: this incursion meets a Defending Fighter and is repelled.
    h.advance(3 * DAY + HOUR);
    await h.service.tick();
    expect(await h.stability("uid-a", "season-a")).toBe(60);
    const after = await h.service.status("uid-a");
    expect(after?.ships.fighterHulls).toEqual([80]);
    expect(after?.digest.some((d) => /Incursion repelled/.test(d.text))).toBe(true);
  });

  it("accepting the Court offer suppresses incursions and locks Move Against the Court", async () => {
    const h = await harness({ dukes: 1 });
    expect((await h.service.answerCourtOffer("uid-a", true)).ok).toBe(true);
    h.advance(3 * DAY + HOUR);
    await h.service.tick();
    expect(await h.stability("uid-a", "season-a")).toBe(100);
    expect(h.counters).toContain("duke_incursion_suppressed_by_court");
    await h.stores.galaxyEconomyStore.upsertBalance({ authUid: "uid-a", influence: 50, production: 0, lastCycleAt: T0 });
    expect(await h.service.moveAgainstCourt("uid-a", 10)).toEqual({ ok: false, code: "LOCKED_BY_COURT_OFFER" });
    expect(await h.service.answerCourtOffer("uid-a", false)).toEqual({ ok: false, code: "NO_PENDING_OFFER" });
  });

  it("Move Against the Court spends Influence, lowers Court Strength, lifts Domain Weight, and uses the Petition action", async () => {
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
    expect(await h.service.moveAgainstCourt("uid-a", 5)).toMatchObject({ ok: false, code: "ACTION_ALREADY_TAKEN_THIS_CYCLE" });
    expect((await h.service.court()).committedInfluence).toBe(20);
  });

  it("the Court falls when all Sectors are captured or driven down, and refuses further wagers", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.stores.galaxyEconomyStore.upsertBalance({ authUid: "uid-a", influence: 5000, production: 0, lastCycleAt: T0 });
    expect((await h.service.moveAgainstCourt("uid-a", 1400)).ok).toBe(true);
    const status = await h.service.status("uid-a");
    expect(status?.court).toMatchObject({ current: 0, fallen: true });
    h.advance(8 * DAY);
    expect(await h.service.moveAgainstCourt("uid-a", 10)).toEqual({ ok: false, code: "COURT_HAS_FALLEN" });
  });
});

describe("galaxy duke service: Probes and raids", () => {
  const seed = async (h: Awaited<ReturnType<typeof harness>>, patch: (s: import("../galaxy-duke-engine/galaxy-duke-types.js").DukeState) => import("../galaxy-duke-engine/galaxy-duke-types.js").DukeState) => {
    await h.service.status("uid-a");
    await h.service.status("uid-b");
    const state = await h.stores.dukeStore.get("uid-a");
    await h.stores.dukeStore.put(patch(state!));
  };

  it("a Probe is consumed, surveys the target, stays in orbit, and reports live changes", async () => {
    const h = await harness();
    await seed(h, (s) => ({ ...s, probeStock: 1 }));
    expect((await h.service.order("uid-a", { kind: "PROBE", seasonId: "season-b" })).ok).toBe(true);
    expect((await h.service.status("uid-a"))?.ships).toMatchObject({ probeStock: 0, inFlight: { kind: "PROBE", seasonId: "season-b" } });
    h.advance(11 * HOUR);
    const arrived = await h.service.status("uid-a");
    expect(arrived?.ships.inFlight).toBeNull();
    expect(arrived?.ships.orbiting).toHaveLength(1);
    expect(arrived?.intel[0]).toMatchObject({ seasonId: "season-b", stability: 100, defenderHull: null, live: true });
    expect((await h.stores.galaxyExplorationStore.getSurveysForOwner("uid-a")).map((s) => s.seasonId)).toEqual(["season-b"]);

    await h.stores.galaxyEconomyStore.setStability("uid-b", "season-b", 60);
    h.advance(HOUR);
    await h.service.tick();
    const later = await h.service.status("uid-a");
    expect(later?.digest.some((d) => /Probe over .*Stability 100 to 60/.test(d.text))).toBe(true);
  });

  it("can't launch without a Probe or at your own Sector, and can't raid an unsurveyed system", async () => {
    const h = await harness();
    await seed(h, (s) => s);
    expect(await h.service.order("uid-a", { kind: "PROBE", seasonId: "season-b" })).toEqual({ ok: false, code: "NO_PROBE" });
    expect(await h.service.order("uid-a", { kind: "RAID", seasonId: "season-b" })).toEqual({ ok: false, code: "NOT_SURVEYED" });
    expect(await h.service.order("uid-a", { kind: "PROBE", seasonId: "nope" })).toEqual({ ok: false, code: "INVALID" });
  });

  it("a raid on an undefended Sector takes a flat 20, is public, and five hits contest it", async () => {
    const h = await harness();
    const surveyed = { seasonId: "season-b", label: "B", stability: 100, defenderHull: null, at: T0, live: false };
    await seed(h, (s) => ({ ...s, fighters: [{ hull: 100 }], intel: [surveyed] }));
    for (let hit = 1; hit <= 5; hit += 1) {
      const sent = await h.service.order("uid-a", { kind: "RAID", seasonId: "season-b" });
      expect(sent.ok).toBe(true);
      h.advance(13 * HOUR);
      await h.service.tick();
      expect(await h.stability("uid-b", "season-b")).toBe(100 - 20 * hit);
      const state = await h.stores.dukeStore.get("uid-a");
      await h.stores.dukeStore.put({ ...state!, actionGate: { lastGatedActionAt: null } });
    }
    expect(await h.stores.galaxyDefenseCampaignStore.getQueueLength()).toBe(1);
    expect((await h.stores.galaxyBattleLogStore.listRecent(10)).length).toBe(5);
    const defender = await h.service.status("uid-b");
    expect(defender?.digest.some((d) => /contested/.test(d.text))).toBe(true);
    expect((await h.service.status("uid-a"))?.ships.fighterHulls).toEqual([100]);
  });

  it("a Defending Fighter holds an equal raid: no Stability loss, both damaged", async () => {
    const h = await harness();
    const surveyed = { seasonId: "season-b", label: "B", stability: 100, defenderHull: 100, at: T0, live: false };
    await seed(h, (s) => ({ ...s, fighters: [{ hull: 100 }], intel: [surveyed] }));
    const b = await h.stores.dukeStore.get("uid-b");
    await h.stores.dukeStore.put({ ...b!, fighters: [{ hull: 100 }] });
    await h.service.order("uid-a", { kind: "RAID", seasonId: "season-b" });
    h.advance(13 * HOUR);
    await h.service.tick();
    expect(await h.stability("uid-b", "season-b")).toBe(100);
    expect((await h.service.status("uid-b"))?.ships.fighterHulls).toEqual([60]);
    expect((await h.service.status("uid-a"))?.ships.fighterHulls).toEqual([60]);
  });
});
