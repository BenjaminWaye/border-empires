// Results of a hosted sector (plan section 9, step 4; section 15, step 8d):
// read from the server's /hq/summary, kept once, and saved before teardown.
import { createRequire } from "node:module";
import type { DatabaseSync as Database } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { fakeContestSummary } from "../providers/fake-providers.js";
import { account, createHostingHarness, DAY, MINUTE } from "../hosting-test-support.js";
import { sectorResultsView } from "../hosting-service/hosting-service.js";
import { RESULTS_EXPORT_GRACE_MS } from "../hosting-service/hosting-reconciler.js";
import { parseContestResults, SqliteHostedResultsStore } from "./hosted-results.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

describe("reading a sector's results", () => {
  it("keeps the standings, and the winner once a House is crowned", () => {
    const crowned = parseContestResults(fakeContestSummary(true));
    expect(crowned).toMatchObject({ seasonId: "fake-season", status: "ended", crowned: true, endedAt: 2_000 });
    expect(crowned.standings).toEqual([
      { playerId: "p1", name: "First House", rank: 1, score: 120, tiles: 40 },
      { playerId: "p2", name: "Second House", rank: 2, score: 60, tiles: 20 }
    ]);
    expect(crowned.details.seasonWinner).toEqual({ playerId: "p1", playerName: "First House" });
    // Closed before anyone was crowned: standings only, not finished.
    expect(parseContestResults(fakeContestSummary(false))).toMatchObject({ crowned: false, status: "active", details: {} });
  });

  it("refuses what is not a contest summary, and skips malformed rows", () => {
    expect(() => parseContestResults({ ok: false, error: "boom" })).toThrow(/no contest/);
    expect(() => parseContestResults(null)).toThrow(/no contest/);
    const results = parseContestResults({ seasonId: "s", overall: [{ id: "p1", name: "A", rank: 1 }, { id: 3, name: "bad", rank: 2 }, "x"] });
    expect(results.standings).toEqual([{ playerId: "p1", name: "A", rank: 1, score: 0, tiles: 0 }]);
    // What was left out is counted.
    expect(results.details.droppedStandings).toBe(2);
    // Too large: the awards go, the standings stay.
    const large = parseContestResults({ seasonId: "s", overall: [{ id: "p1", name: "A", rank: 1 }], seasonAwards: "x".repeat(300 * 1024) });
    expect(large.standings).toHaveLength(1);
    expect(large.details).toEqual({ trimmed: "awards and House Charges too large to keep" });
  });

  it("keeps a long crowned contest without its score history, which is far too large", () => {
    const houses = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, name: `House ${i}`, tiles: 10, score: 1000 - i, rank: i + 1 }));
    const scoreHistory = houses.map((house) => ({ playerId: house.id, points: Array.from({ length: 200 }, (_, t) => ({ t: 1_764_000_000_000 + t, score: t })) }));
    const summary = { ...fakeContestSummary(true), overall: houses, seasonWinner: { playerId: "p0", playerName: "House 0", scoreHistory }, scoreHistory };
    expect(JSON.stringify(summary).length).toBeGreaterThan(512 * 1024);
    const results = parseContestResults(summary);
    expect(results.crowned).toBe(true);
    expect(results.standings).toHaveLength(100);
    expect(results.details.seasonWinner).toEqual({ playerId: "p0", playerName: "House 0" });
  });

  it("replaces an unfinished copy, and keeps a crowned one for good", () => {
    const store = new SqliteHostedResultsStore(new DatabaseSync(":memory:"));
    store.applySchema();
    expect(store.save("s-1", parseContestResults(fakeContestSummary(false)), 10)).toBe(true);
    expect(store.hasCrowned("s-1")).toBe(false);
    expect(store.save("s-1", parseContestResults(fakeContestSummary(true)), 20)).toBe(true);
    expect(store.save("s-1", parseContestResults(fakeContestSummary(false)), 30)).toBe(false);
    expect(store.get("s-1")).toMatchObject({ sectorId: "s-1", savedAt: 20, crowned: true });
    expect(store.get("s-1")?.standings).toHaveLength(2);
    expect(store.get("s-2")).toBeUndefined();
  });
});

describe("results in My sectors", () => {
  it("shows the outcome and this account's place once results are saved", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const hostname = `${sectorId}.sectors.invalid`;
    const summary = fakeContestSummary(true);
    h.servers.summaries.set(hostname, { ...summary, overall: [(summary.overall as object[])[0], { ...(summary.overall as object[])[1], id: "host" }] });
    expect(h.service.listSectors(account("host"))[0]?.results).toBeUndefined();
    h.servers.ended.add(hostname);
    await h.reconciler.runOnce();
    expect(h.service.listSectors(account("host"))[0]?.results).toEqual({ finished: true, houses: 2, rank: 2, winner: "First House" });
  });

  it("says when a sector closed before a crowning, with no winner", () => {
    const store = new SqliteHostedResultsStore(new DatabaseSync(":memory:"));
    store.applySchema();
    store.save("s-1", parseContestResults(fakeContestSummary(false)), 10);
    expect(sectorResultsView(store.get("s-1")!, "p1")).toEqual({ finished: false, houses: 2, rank: 1 });
    expect(sectorResultsView(store.get("s-1")!, "someone-else")).toEqual({ finished: false, houses: 2 });
  });
});

describe("saving results before a sector's server is deleted", () => {
  it("saves a crowned contest's results before the look-around ends", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.servers.ended.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("ended");
    // Saved at crowning: the summary then is the final one.
    const crownedAt = h.clock.now;
    expect(h.results.get(sectorId)).toMatchObject({ crowned: true, savedAt: crownedAt });
    // Whatever the server says by the end of the look-around does not replace it.
    h.servers.summaries.set(`${sectorId}.sectors.invalid`, { seasonId: "new", overall: [] });
    h.clock.now += h.config.lookAroundMs;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
    expect(h.results.get(sectorId)).toMatchObject({ crowned: true, savedAt: crownedAt, seasonId: "fake-season" });
  });

  it("does not take a summary without a winner as an ended contest's results", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const host = `${sectorId}.sectors.invalid`;
    h.servers.ended.add(host);
    h.servers.failSummaries = true;
    await h.reconciler.runOnce();
    h.servers.failSummaries = false;
    h.servers.summaries.set(host, fakeContestSummary(false));
    h.clock.now += h.config.lookAroundMs;
    await h.reconciler.runOnce();
    expect(h.servers.servers.has(`fake-server-${sectorId}`)).toBe(true);
    expect(h.alerts.find((alert) => alert.kind === "results_export_failed")?.details.error).toMatch(/names no winner/);
  });

  it("lets a crowned contest replace the standings saved by an idle closure whose delete failed", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    const host = `${sectorId}.sectors.invalid`;
    h.clock.now += 5 * DAY;
    await h.reconciler.runOnce();
    h.clock.now += 2 * DAY;
    h.servers.failDeletes = true;
    await h.reconciler.runOnce();
    expect(h.results.get(sectorId)).toMatchObject({ crowned: false });
    // Someone comes back, and the contest is later crowned.
    h.servers.failDeletes = false;
    h.servers.lastHumanVisitAt.set(host, h.clock.now);
    h.servers.ended.add(host);
    await h.reconciler.runOnce();
    expect(h.results.get(sectorId)).toMatchObject({ crowned: true });
  });

  it("deletes a server whose results cannot be read after 3 days, and tells the owner", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    await h.service.handlePaymentEvent({ eventId: "evt-refund", kind: "refunded", sectorId, fullRefund: true });
    h.servers.failSummaries = true;
    await h.reconciler.runOnce();
    h.clock.now += RESULTS_EXPORT_GRACE_MS - MINUTE;
    await h.reconciler.runOnce();
    expect(h.servers.servers.has(`fake-server-${sectorId}`)).toBe(true);
    h.clock.now += MINUTE;
    await h.reconciler.runOnce();
    expect(h.servers.servers.has(`fake-server-${sectorId}`)).toBe(false);
    expect(h.alerts.filter((alert) => alert.kind === "results_export_failed")).toHaveLength(1);
    expect(h.alerts.find((alert) => alert.kind === "results_export_abandoned")?.details).toMatchObject({ sectorId });
  });

  it("saves an idle sector's standings, marked not finished", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.clock.now += 5 * DAY;
    await h.reconciler.runOnce();
    h.clock.now += 2 * DAY;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
    expect(h.results.get(sectorId)).toMatchObject({ crowned: false });
  });

  it("keeps the server while its results cannot be read, tells the owner once, and deletes it once they are saved", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    await h.service.handlePaymentEvent({ eventId: "evt-refund", kind: "refunded", sectorId, fullRefund: true });
    h.servers.failSummaries = true;
    for (let pass = 0; pass < 3; pass += 1) {
      h.clock.now += MINUTE;
      await h.reconciler.runOnce();
    }
    expect(h.servers.servers.has(`fake-server-${sectorId}`)).toBe(true);
    expect(h.alerts.filter((alert) => alert.kind === "results_export_failed")).toHaveLength(1);

    h.servers.failSummaries = false;
    await h.reconciler.runOnce();
    expect(h.servers.servers.has(`fake-server-${sectorId}`)).toBe(false);
    expect(h.results.has(sectorId)).toBe(true);
  });

  it("deletes the server of a sector that never opened without asking it for results", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.order();
    await h.service.handlePaymentEvent({ eventId: "evt-paid", kind: "paid", sectorId });
    await h.reconciler.runOnce();
    expect(h.servers.servers.has(`fake-server-${sectorId}`)).toBe(true);
    await h.service.handlePaymentEvent({ eventId: "evt-refund", kind: "refunded", sectorId, fullRefund: true });
    h.servers.failSummaries = true;
    await h.reconciler.runOnce();
    expect(h.servers.servers.has(`fake-server-${sectorId}`)).toBe(false);
    expect(h.results.has(sectorId)).toBe(false);
  });
});
