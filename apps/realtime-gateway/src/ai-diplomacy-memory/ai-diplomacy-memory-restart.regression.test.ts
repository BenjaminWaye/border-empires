import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { buildAiDiplomacyMemoryPersistence } from "../gateway-app/build-social-state-sink.js";
import { SqliteGatewaySocialStore } from "../social-store/social-store-sqlite.js";
import { createAiDiplomacyMemory } from "./ai-diplomacy-memory.js";
import { createDiplomacyMemoryWriter } from "./ai-diplomacy-memory-writer.js";

// Regression: the AI diplomacy memory lived only in gateway memory, so every
// gateway restart (every deploy) reset the trade screen's war tally to 0, made
// AI pricing and war outlook forget the war, and let an AI that had already
// paid for peace pay again.

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };
const isAi = (id: string): boolean => id.startsWith("ai-");

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// One gateway process: opens the SQLite file, boots the memory from it the way gateway-app.ts does, and shuts down with a flush.
const startGateway = (path: string, clock: { now: number }) => {
  const db = new DatabaseSync(path);
  const store = new SqliteGatewaySocialStore(db, () => clock.now);
  store.applySchema();
  const persistence = buildAiDiplomacyMemoryPersistence(store, store.loadSnapshot());
  store.pruneExpired(clock.now);
  const writer = createDiplomacyMemoryWriter({ write: persistence.write });
  const memory = createAiDiplomacyMemory({ now: () => clock.now, isAi, initial: persistence.initial, sink: writer.sink });
  return { memory, stop: () => { writer.flush(); db.close(); } };
};

describe("AI diplomacy memory across a gateway restart", () => {
  it("keeps the war tally and the paid-for-peace mark", () => {
    const directory = mkdtempSync(join(tmpdir(), "ai-memory-restart-"));
    directories.push(directory);
    const path = join(directory, "gateway.sqlite");
    const clock = { now: 1_700_000_000_000 };

    const first = startGateway(path, clock);
    first.memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 7 });
    first.memory.observeCombat({ attackerId: "ai-1", defenderId: "p1", attackerWon: true, tilesCaptured: 2 });
    first.memory.recordPayment("ai-1", "p1", -50);
    const tallyBefore = first.memory.view("ai-1", "p1");
    first.stop();

    clock.now += 5 * 60_000;
    const second = startGateway(path, clock);
    const tallyAfter = second.memory.view("ai-1", "p1");
    expect(Math.round(tallyAfter.tilesTakenFromAi)).toBe(7);
    expect(Math.round(tallyAfter.tilesTakenByAi)).toBe(2);
    expect(tallyAfter.tilesTakenFromAi).toBeLessThan(tallyBefore.tilesTakenFromAi);
    expect(tallyAfter.aiAlreadyPaidThisWar).toBe(true);
    expect(tallyAfter.lastPlayerAttackAt).toBe(tallyBefore.lastPlayerAttackAt);
    second.stop();
  });
});
