/**
 * Regression for the 2026-07-05 staging SIMULATION_UNAVAILABLE incident:
 * exportBarbActivationVisibleUnion's cache signature includes every non-barb
 * player's tileCollectionVersion, so with ~25 concurrently-mutating empires
 * it changes on essentially every system tick — without a floor,
 * ensureVisionUnionFresh recomputed the union (an O(barb_tiles * radius^2)
 * scan measured at 2879ms on staging) back-to-back, every tick. These tests
 * pin the fix: recompute is bounded to at most once per
 * visionUnionMinRecomputeIntervalMs, regardless of how often the signature
 * changes.
 */

import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

type WorkerMessage = { type: string; [key: string]: unknown };

class MockWorker extends EventEmitter {
  readonly posted: WorkerMessage[] = [];

  postMessage(msg: WorkerMessage): void {
    this.posted.push(msg);
    if (msg.type === "plan") {
      queueMicrotask(() => this.emit("message", { type: "command", playerId: msg.playerId, command: null }));
    }
  }

  terminate(): Promise<void> {
    return Promise.resolve();
  }
}

vi.mock("node:worker_threads", () => ({ Worker: MockWorker }));

const { createWorkerSystemCommandProducer } = await import("./system-command-producer-worker.js");

const makeRuntime = (options: { signatureForCallIndex: (callIndex: number) => string }) => {
  const eventEmitter = new EventEmitter();
  let signatureCallCount = 0;
  let unionCallCount = 0;
  // exportBarbActivationVisibleUnion always returns the signature matching
  // the most recent getBarbActivationVisionSignature() call — in the real
  // implementation both derive from the same underlying player state, so
  // they must never disagree here either.
  let lastSignature = "";
  return {
    handle: {
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      exportPlannerWorldView: () => ({
        tiles: [],
        players: [
          {
            id: "barbarian-1",
            points: 500,
            manpower: 100,
            hasActiveLock: false,
            territoryTileKeys: [] as string[],
            frontierTileKeys: [] as string[],
            hotFrontierTileKeys: [] as string[],
            strategicFrontierTileKeys: [] as string[],
            buildCandidateTileKeys: [] as string[],
            pendingSettlementTileKeys: [] as string[],
            activeDevelopmentProcessCount: 0
          }
        ]
      }),
      onEvent: (listener: (event: { playerId: string; eventType: string }) => void) => {
        eventEmitter.on("event", listener);
        return () => eventEmitter.off("event", listener);
      },
      exportPlannerPlayerViews: () => [],
      getBarbActivationVisionSignature: () => {
        lastSignature = options.signatureForCallIndex(signatureCallCount++);
        return lastSignature;
      },
      exportBarbActivationVisibleUnion: () => {
        unionCallCount += 1;
        return { keys: [`recompute-${unionCallCount}`], signature: lastSignature };
      }
    },
    getUnionCallCount: () => unionCallCount
  };
};

describe("worker system command producer — barb vision union throttle", () => {
  it("does not recompute the union more than once per throttle interval, even when the signature changes every tick", async () => {
    let now = 1_000_000;
    // Signature changes on every call — the worst case that used to cause
    // back-to-back recomputes under real 25-player load.
    const { handle, getUnionCallCount } = makeRuntime({ signatureForCallIndex: (i) => `sig-${i}` });
    let throttledCount = 0;

    const producer = createWorkerSystemCommandProducer({
      runtime: handle,
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js",
      now: () => now,
      visionUnionMinRecomputeIntervalMs: 3000,
      onVisionUnionRecomputeThrottled: () => {
        throttledCount += 1;
      }
    });

    // First tick: no prior recompute, so it must go through immediately.
    await producer.tick();
    expect(getUnionCallCount()).toBe(1);

    // Three more ticks within the throttle window (signature keeps changing,
    // but the min-interval floor must suppress every one of these).
    for (let i = 0; i < 3; i++) {
      now += 500;
      await producer.tick();
    }
    expect(getUnionCallCount()).toBe(1);
    expect(throttledCount).toBeGreaterThan(0);

    // Advance past the throttle interval — next tick must recompute again.
    now += 3000;
    await producer.tick();
    expect(getUnionCallCount()).toBe(2);

    producer.close();
  });

  it("does not throttle when the signature is unchanged (no-op path is untouched)", async () => {
    let now = 1_000_000;
    const { handle, getUnionCallCount } = makeRuntime({ signatureForCallIndex: () => "same-signature" });
    let throttledCount = 0;

    const producer = createWorkerSystemCommandProducer({
      runtime: handle,
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js",
      now: () => now,
      visionUnionMinRecomputeIntervalMs: 3000,
      onVisionUnionRecomputeThrottled: () => {
        throttledCount += 1;
      }
    });

    await producer.tick();
    expect(getUnionCallCount()).toBe(1);

    // Signature never changes after the first send, so subsequent ticks
    // should hit the "already sent this signature" short-circuit, not the
    // throttle path at all.
    now += 100;
    await producer.tick();
    now += 100;
    await producer.tick();

    expect(getUnionCallCount()).toBe(1);
    expect(throttledCount).toBe(0);

    producer.close();
  });
});
