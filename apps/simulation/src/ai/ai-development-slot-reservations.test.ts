import { describe, expect, it, vi } from "vitest";

import { createAiCommandProducer } from "./ai-command-producer.js";

describe("AI development slot reservations", () => {
  it("passes local development slot reservations into the next plan request", async () => {
    let nowMs = 1_000;
    const onEvent = vi.fn(() => () => undefined);
    const explainNextAutomationCommand = vi.fn((playerId: string, clientSeq: number, issuedAt: number) => ({
      command: {
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "BUILD_ECONOMIC_STRUCTURE" as const,
        payloadJson: JSON.stringify({ x: 0, y: 0, structureType: "MARKET" })
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

    await producer.tick();
    onEvent.mock.calls[0]?.[0]?.({
      eventType: "TILE_DELTA_BATCH",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-1-1000",
      tileDeltas: []
    });
    nowMs = 1_100;
    await producer.tick();
    producer.close();

    expect(explainNextAutomationCommand).toHaveBeenNthCalledWith(
      2,
      "ai-1",
      2,
      1_100,
      "ai-runtime",
      { skipPreplan: false, reservedDevelopmentSlots: 1 }
    );
  });
});
