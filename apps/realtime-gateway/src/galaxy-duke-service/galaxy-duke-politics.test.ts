import { describe, expect, it } from "vitest";

import { FIGHTER_TRAVEL_MS } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { CYCLE_MS, GRIEVANCE_DURATION_MS } from "../galaxy-duke-engine/galaxy-duke-politics-config.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { DAY, HOUR, T0, harness, withSystem } from "./galaxy-duke-test-harness.js";

type H = Awaited<ReturnType<typeof harness>>;

const giveInfluence = (h: H, authUid: string, influence: number) =>
  h.stores.galaxyEconomyStore.upsertBalance({ authUid, influence, production: 0, lastCycleAt: T0 });

const surveyed = (seasonId: string) => (s: DukeState): DukeState => ({
  ...s,
  intel: [...s.intel, { seasonId, label: "x", stability: 100, defenderHull: null, at: T0, live: false }]
});

describe("AI Dukes (§29.1)", () => {
  const withAi = () => harness([{ seasonId: "season-a", player: "a" }, { seasonId: "season-c", player: "ai-1" }]);

  it("an AI-won Sector is held by an AI Duke named for its House, and does not count against the Court", async () => {
    const h = await withAi();
    const status = await h.service.status("uid-a");
    // Only the player's own Sector lowers the Court: 300 - 10.
    expect(status?.court.current).toBe(290);
    expect(status?.meters.dukeCount).toBe(2);
    expect(status?.politics.rivals).toEqual([expect.objectContaining({ seasonId: "season-c", label: "House Alden", isAi: true })]);
  });

  it("an AI Duke plays: it starts a Fighter, and refuses the Court's protection when it has rivals", async () => {
    const h = await withAi();
    await h.run(HOUR);
    const ai = await h.stores.dukeStore.get("ai:season-c");
    expect(ai?.systems[0]?.slot?.kind).toBe("FIGHTER");
    expect(ai?.courtOffer.status).toBe("DECLINED");
  });

  it("an AI Duke probes its rivals so that it can act on them", async () => {
    const h = await withAi();
    await h.run(HOUR);
    await h.patch("ai:season-c", withSystem("season-c", { probeStock: 1, fighters: [{ hull: 100 }] }));
    await h.run(HOUR);
    const ai = await h.stores.dukeStore.get("ai:season-c");
    expect(ai?.flights).toEqual([expect.objectContaining({ kind: "PROBE", seasonId: "season-a" })]);
  });
});

describe("grievances (§29.2)", () => {
  it("declaring costs Influence, is public, and a raid that gets through pays Renown and takes Influence", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.service.status("uid-b");
    await giveInfluence(h, "uid-a", 10);
    await giveInfluence(h, "uid-b", 10);
    expect((await h.service.declareGrievance("uid-a", "season-b")).ok).toBe(true);
    expect((await h.stores.galaxyEconomyStore.getBalance("uid-a"))?.influence).toBe(5);
    const target = await h.service.status("uid-b");
    expect(target?.politics.grievancesAgainstMe).toHaveLength(1);
    expect(target?.attention.map((a) => a.kind)).toContain("GRIEVANCE_AGAINST_YOU");

    await h.patch("uid-a", (s) => surveyed("season-b")(withSystem("season-a", { fighters: [{ hull: 100 }] })(s)));
    expect((await h.service.order("uid-a", "season-a", { kind: "RAID", targetSeasonId: "season-b" })).ok).toBe(true);
    h.advance(FIGHTER_TRAVEL_MS);
    const after = await h.service.status("uid-a");
    expect(after?.politics.renown).toBe(3);
    expect(after?.politics.grievance?.hits).toBe(1);
    expect((await h.stores.galaxyEconomyStore.getBalance("uid-a"))?.influence).toBe(8);
    expect((await h.stores.galaxyEconomyStore.getBalance("uid-b"))?.influence).toBe(7);
  });

  it("Renown counts toward Domain Weight", async () => {
    const h = await harness();
    const before = (await h.service.status("uid-a"))?.meters.domainWeight ?? 0;
    expect(before).toBeGreaterThan(0);
    await h.patch("uid-a", (s) => ({ ...s, renown: 6 }));
    expect((await h.service.status("uid-a"))?.meters.domainWeight).toBeCloseTo(before + 6);
  });

  it("only one grievance at a time, never against yourself, and not without the Influence", async () => {
    const h = await harness();
    await h.service.status("uid-b");
    expect(await h.service.declareGrievance("uid-a", "season-b")).toMatchObject({ ok: false, code: "INSUFFICIENT_INFLUENCE" });
    await giveInfluence(h, "uid-a", 20);
    expect(await h.service.declareGrievance("uid-a", "season-a")).toMatchObject({ ok: false, code: "OWN_SECTOR" });
    expect((await h.service.declareGrievance("uid-a", "season-b")).ok).toBe(true);
    expect(await h.service.declareGrievance("uid-a", "season-b")).toMatchObject({ ok: false, code: "GRIEVANCE_ALREADY_OPEN" });
  });

  it("a grievance that never lands a hit lapses and costs Renown", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.service.status("uid-b");
    await giveInfluence(h, "uid-a", 10);
    await h.patch("uid-a", (s) => ({ ...s, renown: 5 }));
    expect((await h.service.declareGrievance("uid-a", "season-b")).ok).toBe(true);
    h.advance(GRIEVANCE_DURATION_MS);
    const status = await h.service.status("uid-a");
    expect(status?.politics).toMatchObject({ renown: 3, grievance: null });
  });
});

describe("Writs (§21.3)", () => {
  const offer = (kind: "FIGHTER" | "STRIKE") => (s: DukeState): DukeState => ({
    ...s,
    writ: {
      lastOfferCycle: 0,
      offer:
        kind === "FIGHTER"
          ? { kind, offeredAt: T0, expiresAt: T0 + 3 * DAY }
          : { kind, offeredAt: T0, expiresAt: T0 + 3 * DAY, targetAuthUid: "uid-b", targetSeasonId: "season-b" }
    }
  });

  it("taking a strike raises Court Strength by 3, and the Court's Fighter raids like anyone else's", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.service.status("uid-b");
    await h.patch("uid-a", offer("STRIKE"));
    const before = (await h.service.status("uid-a"))?.court.current ?? 0;
    expect((await h.service.status("uid-a"))?.attention.map((a) => a.kind)).toContain("WRIT_PENDING");
    expect((await h.service.answerWrit("uid-a", true)).ok).toBe(true);
    const status = await h.service.status("uid-a");
    expect(status?.court.current).toBe(before + 3);
    expect(status?.raids).toEqual([expect.objectContaining({ fromSeasonId: "season-a", seasonId: "season-b" })]);
    h.advance(FIGHTER_TRAVEL_MS);
    const after = await h.service.status("uid-a");
    expect(after?.systems[0]?.fighters).toEqual([]);
    expect(await h.stability("uid-b", "season-b")).toBe(80);
  });

  it("taking a Fighter adds one at home; refusing leaves nothing behind and the Court unchanged", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await h.patch("uid-a", offer("FIGHTER"));
    expect((await h.service.answerWrit("uid-a", true)).ok).toBe(true);
    expect((await h.service.status("uid-a"))?.systems[0]?.fighters).toEqual([100]);

    await h.patch("uid-a", offer("FIGHTER"));
    const before = (await h.service.status("uid-a"))?.court.current;
    expect((await h.service.answerWrit("uid-a", false)).ok).toBe(true);
    const status = await h.service.status("uid-a");
    expect(status?.court.current).toBe(before);
    expect(status?.politics.writ).toBeNull();
    expect(await h.service.answerWrit("uid-a", true)).toMatchObject({ ok: false, code: "NO_PENDING_WRIT" });
  });

  it("the Court offers Writs on its own over time once there are rivals", async () => {
    const h = await harness();
    await h.run(10 * CYCLE_MS);
    expect(h.counters.filter((c) => c === "duke_writ_offered").length).toBeGreaterThan(0);
  });
});

describe("the Blind Eye (§21.6)", () => {
  const runaway = () =>
    harness([
      { seasonId: "season-a", player: "a", objective: "DIPLOMATIC_DOMINANCE" },
      { seasonId: "season-a2", player: "a", objective: "DIPLOMATIC_DOMINANCE" },
      { seasonId: "season-a3", player: "a", objective: "DIPLOMATIC_DOMINANCE" },
      { seasonId: "season-b", player: "b" }
    ]);

  it("a Duke far ahead for a full Cycle loses the Court's Favor; rivals then declare for free", async () => {
    const h = await runaway();
    await h.run(CYCLE_MS + HOUR);
    const leader = await h.service.status("uid-a");
    expect(leader?.politics.favor.revoked).toBe(true);
    expect(leader?.attention[0]?.kind).toBe("FAVOR_REVOKED");
    const rival = await h.service.status("uid-b");
    expect(rival?.politics.rivals[0]).toMatchObject({ revoked: true, grievanceCost: 0 });
    expect((await h.service.declareGrievance("uid-b", "season-a")).ok).toBe(true);
  });

  it("lending a Fighter to the Court restores its Favor, pays a stipend, and the Fighter comes home", async () => {
    const h = await runaway();
    await h.run(CYCLE_MS + HOUR);
    await h.patch("uid-a", withSystem("season-a", { fighters: [{ hull: 100 }] }));
    const influence = (await h.stores.galaxyEconomyStore.getBalance("uid-a"))?.influence ?? 0;
    expect((await h.service.lendFleet("uid-a", "season-a")).ok).toBe(true);
    const status = await h.service.status("uid-a");
    expect(status?.politics.favor.revoked).toBe(false);
    expect(status?.politics.lent).toHaveLength(1);
    expect((await h.stores.galaxyEconomyStore.getBalance("uid-a"))?.influence).toBe(influence + 4);
    h.advance(CYCLE_MS);
    expect((await h.service.status("uid-a"))?.politics.lent).toEqual([]);
  });
});
