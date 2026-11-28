// Results of a hosted sector (plan section 9, step 4; section 15, step 8d):
// read from the server's /hq/summary, kept once, and saved before teardown.
import { createRequire } from "node:module";
import type { DatabaseSync as Database } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { fakeContestSummary } from "../providers/fake-providers.js";
import { createHostingHarness, DAY, MINUTE } from "../hosting-test-support.js";
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
    expect(() => parseContestResults({ seasonId: "s", overall: [], seasonAwards: "x".repeat(300 * 1024) })).toThrow(/too large/);
  });

  it("keeps the first copy of a sector's results", () => {
    const store = new SqliteHostedResultsStore(new DatabaseSync(":memory:"));
    store.applySchema();
    expect(store.save("s-1", parseContestResults(fakeContestSummary(true)), 10)).toBe(true);
    expect(store.save("s-1", parseContestResults(fakeContestSummary(false)), 20)).toBe(false);
    expect(store.get("s-1")).toMatchObject({ sectorId: "s-1", savedAt: 10, crowned: true });
    expect(store.get("s-1")?.standings).toHaveLength(2);
    expect(store.get("s-2")).toBeUndefined();
  });
});

describe("saving results before a sector's server is deleted", () => {
  it("saves a crowned contest's results before the look-around ends", async () => {
    const h = await createHostingHarness();
    const sectorId = await h.openSector();
    h.servers.ended.add(`${sectorId}.sectors.invalid`);
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("ended");
    h.clock.now += h.config.lookAroundMs;
    await h.reconciler.runOnce();
    expect(h.store.getSector(sectorId)?.state).toBe("deleted");
    expect(h.results.get(sectorId)).toMatchObject({ crowned: true, savedAt: h.clock.now });
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
