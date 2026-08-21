import { describe, expect, it, vi } from "vitest";

import { BEACON_CADENCE_BOOSTED_BUILDS } from "./ai-beacon-cadence.js";
import { createAiCommandProducer } from "./ai-command-producer.js";

// Integration cover for the wiring between ai-command-producer.ts's event
// listener (which records each accepted BUILD_* command) and the
// beaconBoostActive flag it passes into explainNextAutomationCommand's
// options — the cadence module itself (ai-beacon-cadence.test.ts) only
// covers the pure position math.
describe("ai command producer — beacon cadence wiring", () => {
  it("drops beaconBoostActive after BEACON_CADENCE_BOOSTED_BUILDS accepted builds, then restores it after the cycle wraps", async () => {
    let nowMs = 1_000;
    const onEvent = vi.fn(() => () => undefined);
    const explainNextAutomationCommand = vi.fn((playerId: string, seq: number, issuedAt: number) => ({
      command: {
        commandId: `ai-runtime-${playerId}-${seq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq: seq,
        issuedAt,
        type: "BUILD_ECONOMIC_STRUCTURE" as const,
        payloadJson: JSON.stringify({ x: 0, y: 0, structureType: "MINTWORKS" })
      },
      diagnostic: { playerId, sessionPrefix: "ai-runtime" as const }
    }));
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn(() => undefined),
        explainNextAutomationCommand,
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      now: () => nowMs,
      tickIntervalMs: 10_000
    });

    const completeOneBuildCycle = async (): Promise<void> => {
      await producer.tick();
      const call = explainNextAutomationCommand.mock.calls.at(-1);
      const commandId = `ai-runtime-ai-1-${call?.[1]}-${call?.[2]}`;
      onEvent.mock.calls[0]?.[0]?.({ eventType: "TILE_DELTA_BATCH", playerId: "ai-1", commandId, tileDeltas: [] });
      nowMs += 100;
    };

    // First call (fresh player): boosted.
    await producer.tick();
    expect(explainNextAutomationCommand.mock.calls[0]?.[4]).toMatchObject({ beaconBoostActive: true });
    onEvent.mock.calls[0]?.[0]?.({ eventType: "TILE_DELTA_BATCH", playerId: "ai-1", commandId: "ai-runtime-ai-1-1-1000", tileDeltas: [] });
    nowMs += 100;

    // 3 more accepted builds (4 total) — still boosted for all of them.
    for (let i = 0; i < BEACON_CADENCE_BOOSTED_BUILDS - 1; i += 1) {
      await completeOneBuildCycle();
      expect(explainNextAutomationCommand.mock.calls.at(-1)?.[4]).toMatchObject({ beaconBoostActive: true });
    }

    // The 5th call in the cycle: no boost.
    await producer.tick();
    expect(explainNextAutomationCommand.mock.calls.at(-1)?.[4]).not.toHaveProperty("beaconBoostActive");
    const fifthCall = explainNextAutomationCommand.mock.calls.at(-1);
    onEvent.mock.calls[0]?.[0]?.({
      eventType: "TILE_DELTA_BATCH",
      playerId: "ai-1",
      commandId: `ai-runtime-ai-1-${fifthCall?.[1]}-${fifthCall?.[2]}`,
      tileDeltas: []
    });
    nowMs += 100;

    // Cycle wrapped — boosted again.
    await producer.tick();
    expect(explainNextAutomationCommand.mock.calls.at(-1)?.[4]).toMatchObject({ beaconBoostActive: true });

    producer.close();
  });
});
