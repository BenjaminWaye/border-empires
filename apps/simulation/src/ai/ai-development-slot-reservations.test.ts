import { describe, expect, it, vi } from "vitest";

import { createAiCommandProducer } from "./ai-command-producer.js";
import {
  clearDevelopmentReservationsForPlayer,
  reservedDevelopmentSlotCount,
  reserveDevelopmentSlot,
  type DevelopmentSlotReservation
} from "./ai-development-slot-reservations.js";

describe("clearDevelopmentReservationsForPlayer", () => {
  // Regression: reservations previously only cleared on COMMAND_REJECTED or
  // after a fixed 6s grace timer (AI_DEVELOPMENT_RESERVATION_GRACE_MS) —
  // neither is tied to whether the AI worker's player snapshot has actually
  // caught up with the accepted build. A build cooldown driven off the
  // reservation must lift as soon as a fresh sync lands, not on a guess.
  it("removes every reservation for the player regardless of expiry time", () => {
    const state = new Map<string, DevelopmentSlotReservation[]>();
    reserveDevelopmentSlot(
      state,
      { commandId: "cmd-1", type: "BUILD_FORT", playerId: "ai-1", sessionId: "ai-runtime:ai-1", clientSeq: 1, issuedAt: 0, payloadJson: "{}" },
      1_000
    );
    expect(reservedDevelopmentSlotCount(state, "ai-1", 1_000)).toBe(1);

    clearDevelopmentReservationsForPlayer(state, "ai-1");

    expect(reservedDevelopmentSlotCount(state, "ai-1", 1_000)).toBe(0);
  });

  it("does not affect other players' reservations", () => {
    const state = new Map<string, DevelopmentSlotReservation[]>();
    reserveDevelopmentSlot(
      state,
      { commandId: "cmd-1", type: "BUILD_FORT", playerId: "ai-1", sessionId: "ai-runtime:ai-1", clientSeq: 1, issuedAt: 0, payloadJson: "{}" },
      1_000
    );
    reserveDevelopmentSlot(
      state,
      { commandId: "cmd-2", type: "BUILD_ECONOMIC_STRUCTURE", playerId: "ai-2", sessionId: "ai-runtime:ai-2", clientSeq: 1, issuedAt: 0, payloadJson: "{}" },
      1_000
    );

    clearDevelopmentReservationsForPlayer(state, "ai-1");

    expect(reservedDevelopmentSlotCount(state, "ai-1", 1_000)).toBe(0);
    expect(reservedDevelopmentSlotCount(state, "ai-2", 1_000)).toBe(1);
  });

  it("is a no-op for a player with no reservations", () => {
    const state = new Map<string, DevelopmentSlotReservation[]>();
    expect(() => clearDevelopmentReservationsForPlayer(state, "ai-1")).not.toThrow();
    expect(reservedDevelopmentSlotCount(state, "ai-1", 1_000)).toBe(0);
  });
});

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
