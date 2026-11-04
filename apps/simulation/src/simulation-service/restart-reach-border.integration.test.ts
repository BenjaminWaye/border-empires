import { describe, expect, it, vi } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { createSimulationService } from "./simulation-service.js";

const FIXED_NOW_MS = 1_000;

const bootSim = (stores: {
  commandStore: InMemorySimulationCommandStore;
  eventStore: InMemorySimulationEventStore;
  snapshotStore: InMemorySimulationSnapshotStore;
}) =>
  createSimulationService({
    ...stores,
    // Periodic checkpoints effectively off, so any checkpoint after boot is the forced baseline.
    checkpointEveryEvents: 1_000_000_000,
    runtimeOptions: { now: () => FIXED_NOW_MS },
    seedProfile: "default",
    enableAiAutopilot: false,
    enableSystemAutopilot: false,
    allowSeedRecoveryFallback: true,
    port: 0
  });

describe("reach border baseline after a boot with no saved border", () => {
  // Regression: a snapshot without `reachBorder` (the first deploy of
  // persistence, a season rollover, bootstrap state) makes recovery drop every
  // REACH_BORDER_CHANGED diff, because a diff needs a known base. Until the
  // next event-count checkpoint, a crash re-decided contested reach from
  // ownership/anchor order again. The service now checkpoints the rebuilt
  // border right after such a boot.
  it("checkpoints the rebuilt border immediately", async () => {
    const stores = {
      commandStore: new InMemorySimulationCommandStore(),
      eventStore: new InMemorySimulationEventStore(),
      snapshotStore: new InMemorySimulationSnapshotStore()
    };
    const before = await bootSim(stores);
    before.runtime.submitCommand({
      commandId: "restart-reach-expand",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: FIXED_NOW_MS,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await vi.waitFor(async () => expect(await stores.eventStore.loadLatestEventId()).toBeGreaterThan(0));
    await before.close();

    // Rewrite the latest snapshot as one written before the border was persisted.
    const saved = (await stores.snapshotStore.loadLatestSnapshot())!;
    const { reachBorder: _dropped, ...legacyInitialState } = saved.snapshotPayload.initialState;
    await stores.snapshotStore.saveSnapshot({
      lastAppliedEventId: saved.lastAppliedEventId,
      snapshotSections: { initialState: legacyInitialState, commandEvents: saved.snapshotPayload.commandEvents },
      createdAt: saved.createdAt + 1
    });
    expect((await stores.snapshotStore.loadLatestSnapshot())!.snapshotPayload.initialState.reachBorder).toBeUndefined();

    const after = await bootSim(stores);
    await vi.waitFor(async () => expect((await stores.snapshotStore.loadLatestSnapshot())!.snapshotPayload.initialState.reachBorder).toBeDefined());
    await after.close();
  });
});
