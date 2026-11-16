import { describe, expect, it } from "vitest";

import { buildAiDiplomacyMemoryPersistence } from "../gateway-app/build-social-state-sink.js";
import { InMemoryGatewaySocialStore } from "../social-store/social-store.js";
import { createAiDiplomacyMemory, MAX_DIPLOMACY_MEMORY_PAIRS, WAR_MEMORY_HALF_LIFE_MS } from "./ai-diplomacy-memory.js";
import { DIPLOMACY_MEMORY_TIMESTAMP_RETENTION_MS, type StoredDiplomacyMemoryPair } from "./ai-diplomacy-memory-record.js";
import { createDiplomacyMemoryWriter } from "./ai-diplomacy-memory-writer.js";

const isAi = (id: string): boolean => id.startsWith("ai-");

// Boots a memory the way build-diplomacy-socket-handler.ts does: from the store's snapshot, writing back through the batched writer.
const boot = (store: InMemoryGatewaySocialStore, clock: { now: number }) => {
  const persistence = buildAiDiplomacyMemoryPersistence(store, store.loadSnapshot());
  const timers: Array<() => void> = [];
  const writer = createDiplomacyMemoryWriter({ write: persistence.write, setTimer: (task) => (timers.push(task), { clear: () => undefined }) });
  const memory = createAiDiplomacyMemory({ now: () => clock.now, isAi, initial: persistence.initial, sink: writer.sink });
  return { memory, writer, timers };
};

const fight = (memory: ReturnType<typeof createAiDiplomacyMemory>) => {
  memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 6 });
  memory.observeCombat({ attackerId: "ai-1", defenderId: "p1", attackerWon: false, tilesCaptured: 0, tilesCapturedByDefender: 1 });
  memory.observeCombat({ attackerId: "ai-1", defenderId: "p2", attackerWon: true, tilesCaptured: 3 });
  memory.recordTruceDeal("ai-1", "p1");
  memory.recordPayment("ai-1", "p1", 40);
  memory.recordPayment("ai-2", "p2", -25);
};

describe("AI diplomacy memory persistence", () => {
  it("restores the same view from the store, and keeps fading across the restart gap", () => {
    const clock = { now: 1_000_000 };
    const store = new InMemoryGatewaySocialStore(() => clock.now);
    const before = boot(store, clock);
    fight(before.memory);
    clock.now += 60_000;
    before.memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 2 });
    before.writer.flush();

    clock.now += 3 * 60 * 60_000;
    const after = boot(store, clock);
    for (const [aiId, playerId] of [["ai-1", "p1"], ["ai-1", "p2"], ["ai-2", "p2"]] as const) {
      expect(after.memory.view(aiId, playerId)).toEqual(before.memory.view(aiId, playerId));
    }
    expect(after.memory.view("ai-2", "p2").aiAlreadyPaidThisWar).toBe(true);
    const tilesNow = after.memory.view("ai-1", "p1").tilesTakenFromAi;
    clock.now += WAR_MEMORY_HALF_LIFE_MS;
    expect(after.memory.view("ai-1", "p1").tilesTakenFromAi).toBeCloseTo(tilesNow / 2);
    expect(after.memory.view("ai-1", "p1")).toEqual(before.memory.view("ai-1", "p1"));
  });

  it("coalesces changes into one write per pair until the timer fires", () => {
    const clock = { now: 1_000 };
    const store = new InMemoryGatewaySocialStore(() => clock.now);
    const { memory, writer, timers } = boot(store, clock);
    for (let index = 0; index < 5; index += 1) memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 1 });
    expect(writer.pendingCount()).toBe(1);
    expect(timers).toHaveLength(1);
    expect(store.loadSnapshot().aiDiplomacyMemory).toEqual([]);
    timers[0]!();
    expect(store.loadSnapshot().aiDiplomacyMemory?.[0]?.tilesTakenFromAi.value).toBe(5);
  });

  it("keeps a failed write for the next try", () => {
    const clock = { now: 1_000 };
    let fail = true;
    const written: StoredDiplomacyMemoryPair[] = [];
    const errors: number[] = [];
    const writer = createDiplomacyMemoryWriter({
      write: (upserts) => { if (fail) throw new Error("database is locked"); written.push(...upserts); },
      setTimer: () => ({ clear: () => undefined }),
      onError: (_error, pairs) => errors.push(pairs)
    });
    const memory = createAiDiplomacyMemory({ now: () => clock.now, isAi, sink: writer.sink });
    memory.recordTruceDeal("ai-1", "p1");
    writer.flush();
    expect(errors).toEqual([1]);
    fail = false;
    writer.flush();
    expect(written.map((pair) => pair.truceDeals.value)).toEqual([1]);
  });

  it("prunes pairs once everything has faded and deletes them from the store", () => {
    const clock = { now: 1_000 };
    const store = new InMemoryGatewaySocialStore(() => clock.now);
    const { memory, writer } = boot(store, clock);
    memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 2 });
    writer.flush();
    clock.now += DIPLOMACY_MEMORY_TIMESTAMP_RETENTION_MS;
    expect(memory.prune()).toBe(0);
    clock.now += 20 * WAR_MEMORY_HALF_LIFE_MS;
    expect(memory.prune()).toBe(1);
    expect(memory.stats()).toEqual({ pairs: 0, evictedTotal: 0, prunedTotal: 1 });
    writer.flush();
    expect(store.loadSnapshot().aiDiplomacyMemory).toEqual([]);
  });

  it("drops faded pairs when loading, and deletes their rows", () => {
    const clock = { now: 1_000 };
    const store = new InMemoryGatewaySocialStore(() => clock.now);
    const first = boot(store, clock);
    first.memory.recordTruceDeal("ai-1", "p1");
    first.writer.flush();
    clock.now += 365 * 24 * 60 * 60_000;
    const second = boot(store, clock);
    expect(second.memory.size()).toBe(0);
    expect(second.memory.stats().prunedTotal).toBe(1);
    second.writer.flush();
    expect(store.loadSnapshot().aiDiplomacyMemory).toEqual([]);
  });

  it("deletes evicted pairs from the store, keeping it at the memory's cap", () => {
    const clock = { now: 1_000 };
    const store = new InMemoryGatewaySocialStore(() => clock.now);
    const { memory, writer } = boot(store, clock);
    for (let index = 0; index <= MAX_DIPLOMACY_MEMORY_PAIRS; index += 1) {
      clock.now += 1;
      memory.recordTruceDeal("ai-1", `p${index}`);
    }
    writer.flush();
    expect(memory.stats()).toEqual({ pairs: MAX_DIPLOMACY_MEMORY_PAIRS, evictedTotal: 1, prunedTotal: 0 });
    const stored = store.loadSnapshot().aiDiplomacyMemory ?? [];
    expect(stored).toHaveLength(MAX_DIPLOMACY_MEMORY_PAIRS);
    expect(stored.some((pair) => pair.playerId === "p0")).toBe(false);
  });

  it("forgets everything at a new season", () => {
    const clock = { now: 1_000 };
    const store = new InMemoryGatewaySocialStore(() => clock.now);
    const { memory, writer } = boot(store, clock);
    fight(memory);
    writer.flush();
    memory.recordTruceDeal("ai-1", "p1");
    store.clearSeasonData();
    writer.discard();
    memory.reset();
    writer.flush();
    expect(memory.view("ai-1", "p1").tilesTakenFromAi).toBe(0);
    expect(store.loadSnapshot().aiDiplomacyMemory).toEqual([]);
  });
});
