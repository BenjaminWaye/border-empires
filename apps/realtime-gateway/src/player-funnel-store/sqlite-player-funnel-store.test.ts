import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { InMemoryPlayerFunnelStore, type PlayerFunnelStore } from "./player-funnel-store.js";
import { SqlitePlayerFunnelStore } from "./sqlite-player-funnel-store.js";

// Vitest can't resolve `node:sqlite` statically; same createRequire workaround
// as sqlite-player-growth-baseline-store.test.ts.
type Database = ConstructorParameters<typeof SqlitePlayerFunnelStore>[0];
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

const stores: Array<[string, () => Promise<PlayerFunnelStore>]> = [
  ["sqlite", async () => {
    const store = new SqlitePlayerFunnelStore(new DatabaseSync(":memory:"));
    await store.applySchema();
    return store;
  }],
  ["in-memory", async () => new InMemoryPlayerFunnelStore()]
];

describe.each(stores)("player funnel store (%s)", (_name, create) => {
  it("keeps accountNew and firstSeenAt from the first sighting and bumps lastSeenAt", async () => {
    const store = await create();
    await store.ensurePlayer("p1", 100, true);
    await store.ensurePlayer("p1", 50, false);
    await store.ensurePlayer("p1", 300, false);
    expect(await store.listPlayers()).toEqual([{ playerId: "p1", firstSeenAt: 100, lastSeenAt: 300, accountNew: true }]);
  });

  it("records milestones first-write-wins, with detail, only for known players", async () => {
    const store = await create();
    expect(await store.recordMilestone("ghost", "spawned", 1)).toBe(false);
    await store.ensurePlayer("p1", 100, true);
    expect(await store.recordMilestone("p1", "first_contact", 200, { withPlayerId: "ai-1", withIsAi: true })).toBe(true);
    expect(await store.recordMilestone("p1", "first_contact", 300, { withPlayerId: "p2", withIsAi: false })).toBe(false);
    expect(await store.recordMilestone("p1", "first_interaction", 400, { type: "truce", withPlayerId: "p2", withIsAi: false })).toBe(true);
    expect(await store.recordMilestone("p1", "first_move", 150, { type: "EXPAND" })).toBe(true);
    expect((await store.listPlayers())[0]).toEqual({
      playerId: "p1", firstSeenAt: 100, lastSeenAt: 100, accountNew: true,
      firstMoveAt: 150, firstMoveType: "EXPAND",
      firstContactAt: 200, firstContactWith: "ai-1", firstContactIsAi: true,
      firstInteractionAt: 400, firstInteractionType: "truce", firstInteractionWith: "p2", firstInteractionIsAi: false
    });
  });

  it("opens, touches and finds the latest session", async () => {
    const store = await create();
    const first = await store.openSession("p1", 100);
    await store.touchSession(first, 500);
    await store.touchSession(first, 400); // never moves backwards
    const second = await store.openSession("p1", 1_000);
    expect(await store.lastSession("p1")).toEqual({ id: second, playerId: "p1", startedAt: 1_000, endedAt: 1_000 });
    expect((await store.listSessions(0)).find((row) => row.id === first)?.endedAt).toBe(500);
    expect(await store.listSessions(600)).toHaveLength(1);
  });

  it("dedupes acquisition steps per visitor", async () => {
    const store = await create();
    expect(await store.recordAcquisitionStep({ visitorId: "v1", step: "visit", at: 1, detail: { referrerHost: "borderempires.com" } })).toBe(true);
    expect(await store.recordAcquisitionStep({ visitorId: "v1", step: "visit", at: 2, detail: {} })).toBe(false);
    expect(await store.recordAcquisitionStep({ visitorId: "v1", step: "sign_up", at: 3, detail: {} })).toBe(true);
    expect(await store.listAcquisitionSteps(2)).toEqual([{ visitorId: "v1", step: "sign_up", at: 3, detail: {} }]);
  });

  it("prunes by age and caps row counts, keeping the newest", async () => {
    const store = await create();
    for (let i = 0; i < 5; i += 1) {
      await store.openSession("p1", 1_000 + i);
      await store.recordAcquisitionStep({ visitorId: `visitor-${i}`, step: "visit", at: 1_000 + i, detail: {} });
    }
    await store.openSession("p1", 10);
    await store.prune({ olderThan: 500, maxSessionRows: 3, maxAcquisitionRows: 2 });
    expect((await store.listSessions(0)).map((row) => row.startedAt).sort()).toEqual([1_002, 1_003, 1_004]);
    expect((await store.listAcquisitionSteps(0)).map((row) => row.at).sort()).toEqual([1_003, 1_004]);
  });
});
