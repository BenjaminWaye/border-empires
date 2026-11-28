import { createRequire } from "node:module";
import type { DatabaseSync as Database } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { createHostingHarness } from "../hosting-test-support.js";
import { createHostingReconciler } from "../hosting-service/hosting-reconciler.js";
import { fakeContestSummary } from "../providers/fake-providers.js";
import { parseSectorControlRuntimeEnv } from "../runtime-env/runtime-env.js";
import { parseContestResults, SqliteHostedResultsStore } from "./hosted-results.js";
import {
  createGatewayResultsClient, createHostedResultsPublisher, PUBLISH_ALERT_AFTER, publishRetryDelayMs, SqliteHostedResultsPublishLog, type HostedResultsPayload
} from "./hosted-results-publisher.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

const build = (members: Record<string, string[]> = { "s-1": ["p2", "gone"] }) => {
  const db = new DatabaseSync(":memory:");
  const results = new SqliteHostedResultsStore(db);
  results.applySchema();
  const log = new SqliteHostedResultsPublishLog(db);
  log.applySchema();
  const clock = { now: 1_000_000 };
  const sent: HostedResultsPayload[] = [];
  const alerts: string[] = [];
  let failing = false;
  const publisher = createHostedResultsPublisher({
    log, results, memberUids: (sectorId) => members[sectorId] ?? [], now: () => clock.now,
    alert: (kind) => { alerts.push(kind); },
    gateway: { record: async (payload) => { if (failing) throw new Error("gateway down"); sent.push(payload); } }
  });
  return { results, publisher, clock, sent, alerts, setFailing: (value: boolean) => { failing = value; } };
};

describe("sending hosted results to the gateway", () => {
  it("sends members only, by uid, counting every House, once per saved copy", async () => {
    const h = build();
    h.results.save("s-1", parseContestResults(fakeContestSummary(false)), 500);
    expect(await h.publisher.runOnce()).toEqual({ sent: 1, failed: 0 });
    expect(h.sent).toEqual([{ sectorId: "s-1", endedAt: 500, finished: false, houses: 2, standings: [{ uid: "p2", rank: 2 }] }]);
    expect(await h.publisher.runOnce()).toEqual({ sent: 0, failed: 0 });

    // The crowned copy that replaces it is sent again, as finished.
    h.results.save("s-1", parseContestResults(fakeContestSummary(true)), 900);
    await h.publisher.runOnce();
    expect(h.sent[1]).toEqual({ sectorId: "s-1", endedAt: 2_000, finished: true, houses: 2, standings: [{ uid: "p2", rank: 2 }] });
  });

  it("marks a sector with no member in its standings as done without calling the gateway", async () => {
    const h = build({});
    h.results.save("s-1", parseContestResults(fakeContestSummary(true)), 500);
    expect(await h.publisher.runOnce()).toEqual({ sent: 1, failed: 0 });
    expect(h.sent).toEqual([]);
  });

  it("tries again later after a failure, and tells the owner once when it keeps failing", async () => {
    const h = build();
    h.results.save("s-1", parseContestResults(fakeContestSummary(true)), 500);
    h.setFailing(true);
    expect(await h.publisher.runOnce()).toEqual({ sent: 0, failed: 1 });
    // Not due again until the delay has passed.
    expect(await h.publisher.runOnce()).toEqual({ sent: 0, failed: 0 });
    for (let attempt = 1; attempt < PUBLISH_ALERT_AFTER + 2; attempt += 1) {
      h.clock.now += publishRetryDelayMs(attempt);
      await h.publisher.runOnce();
    }
    expect(h.alerts).toEqual(["hosted_results_unpublished"]);
    h.setFailing(false);
    h.clock.now += publishRetryDelayMs(PUBLISH_ALERT_AFTER + 2);
    expect(await h.publisher.runOnce()).toEqual({ sent: 1, failed: 0 });
    expect(h.sent).toHaveLength(1);
  });

  it("posts to the gateway route with the hosting service key, and fails on an error status", async () => {
    const calls: Array<{ url: string; authorization: string | undefined }> = [];
    let status = 200;
    const client = createGatewayResultsClient({
      gatewayUrl: "https://gw.example/", token: "t".repeat(32),
      fetch: async (url, init) => { calls.push({ url, authorization: init.headers.authorization }); return { ok: status < 300, status }; }
    });
    const payload = { sectorId: "s-1", endedAt: 1, finished: true, houses: 2, standings: [{ uid: "u", rank: 1 }] };
    await client.record(payload);
    expect(calls).toEqual([{ url: "https://gw.example/admin/hosted-results/record", authorization: `Bearer ${"t".repeat(32)}` }]);
    status = 401;
    await expect(client.record(payload)).rejects.toThrow("401");
  });
});

describe("the reconciler", () => {
  it("sends a crowned sector's results on the pass that saves them", async () => {
    const h = await createHostingHarness();
    const sent: HostedResultsPayload[] = [];
    const reconciler = createHostingReconciler({
      store: h.store, payment: h.payment, servers: h.servers, alert: () => undefined, config: h.config, now: () => h.clock.now, results: h.results,
      resultsPublisher: createHostedResultsPublisher({
        // Due as soon as a copy is saved, until it is sent.
        log: { listDue: () => (h.results.has(sectorId) && sent.length === 0 ? [sectorId] : []), markPublished: () => undefined, noteFailure: () => 1 },
        results: h.results, memberUids: (id) => h.store.listMemberUids(id), alert: () => undefined, now: () => h.clock.now,
        gateway: { record: async (payload) => { sent.push(payload); } }
      })
    });
    const sectorId = await h.openSector();
    const hostname = `${sectorId}.sectors.invalid`;
    const summary = fakeContestSummary(true);
    // The host played as "host": a member, so their place is sent; the AI House is not.
    h.servers.summaries.set(hostname, { ...summary, overall: [{ ...(summary.overall as object[])[0], id: "host" }, (summary.overall as object[])[1]] });
    h.servers.ended.add(hostname);
    await reconciler.runOnce();
    expect(sent).toEqual([{ sectorId, endedAt: 2_000, finished: true, houses: 2, standings: [{ uid: "host", rank: 1 }] }]);
  });
});

describe("the gateway settings", () => {
  const base = { HOSTING_SQLITE_PATH: ":memory:", HOSTING_TICKET_PRIVATE_KEY: "key" };
  it("takes the gateway URL and key together, or neither", () => {
    expect(parseSectorControlRuntimeEnv(base).gateway).toBeUndefined();
    const token = "k".repeat(32);
    expect(parseSectorControlRuntimeEnv({ ...base, HOSTING_GATEWAY_URL: "https://api.example", HOSTING_SERVICE_TOKEN: token }).gateway).toEqual({ url: "https://api.example", token });
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_GATEWAY_URL: "https://api.example" })).toThrow("together");
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_SERVICE_TOKEN: token })).toThrow("together");
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_GATEWAY_URL: "https://api.example", HOSTING_SERVICE_TOKEN: "short" })).toThrow("32");
  });
});
