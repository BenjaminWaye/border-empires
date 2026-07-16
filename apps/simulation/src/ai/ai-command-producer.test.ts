import { describe, expect, it, vi } from "vitest";

import { createAiCommandProducer } from "./ai-command-producer.js";
import { SETTLE_INTENT_WAKE_MS, wakeWindowMsForCommand } from "./ai-intent-latch-helpers.js";
import { MAX_SETTLE_DURATION_MS } from "../runtime/runtime.js";

describe("ai command producer", () => {
  it("keeps the settle intent fallback long enough for forest settlement duration", () => {
    expect(wakeWindowMsForCommand("SETTLE")).toBe(SETTLE_INTENT_WAKE_MS);
    expect(SETTLE_INTENT_WAKE_MS).toBe(MAX_SETTLE_DURATION_MS + 1_000);
  });

  it("submits AI frontier commands through the same durable envelope path", async () => {
    const submitted: Array<{ playerId: string; type: string; payloadJson: string; clientSeq: number }> = [];
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn((playerId: string, clientSeq: number, issuedAt: number) => ({
          commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
          sessionId: `ai-runtime:${playerId}`,
          playerId,
          clientSeq,
          issuedAt,
          type: "EXPAND" as const,
          payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
        })),
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: () => () => undefined
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submitted.push({
          playerId: command.playerId,
          type: command.type,
          payloadJson: command.payloadJson,
          clientSeq: command.clientSeq
        });
      },
      tickIntervalMs: 10_000
    });

    await producer.tick();
    producer.close();

    expect(submitted.length).toBeGreaterThanOrEqual(1);
    expect(submitted.at(-1)).toMatchObject({
      playerId: "ai-1",
      clientSeq: expect.any(Number)
    });
    expect(["ATTACK", "EXPAND"]).toContain(submitted.at(-1)!.type);
    expect(JSON.parse(submitted.at(-1)!.payloadJson)).toEqual(
      expect.objectContaining({
        fromX: expect.any(Number),
        fromY: expect.any(Number),
        toX: expect.any(Number),
        toY: expect.any(Number)
      })
    );
  });

  it("pauses AI submissions while human interactive backlog exists", async () => {
    let humanInteractive = 1;
    const submitCommand = vi.fn(async () => undefined);
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn((playerId: string, clientSeq: number, issuedAt: number) => ({
          commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
          sessionId: `ai-runtime:${playerId}`,
          playerId,
          clientSeq,
          issuedAt,
          type: "EXPAND" as const,
          payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
        })),
        queueDepths: () => ({ human_interactive: humanInteractive, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: () => () => undefined
      },
      aiPlayerIds: ["ai-1"],
      submitCommand,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    expect(submitCommand).not.toHaveBeenCalled();

    humanInteractive = 0;
    await producer.tick();
    producer.close();

    expect(submitCommand).toHaveBeenCalled();
  });

  it("rotates across AI players instead of always retrying the first player", async () => {
    const onEvent = vi.fn(() => () => undefined);
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1", "ai-2", "ai-3"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => 1_000,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-1", commandId: "ai-runtime-ai-1-1-1000" });
    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-2", commandId: "ai-runtime-ai-2-1-1000" });
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-2", "ai-3"]);
  });

  it("prioritizes an AI defender on the next tick when a human captures one of its tiles", async () => {
    const onEvent = vi.fn(() => () => undefined);
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "ATTACK" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1", "ai-2", "ai-3"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => 1_000,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-1", commandId: "ai-runtime-ai-1-1-1000" });

    // Human "human-1" captures an "ai-3" tile. The AI defender should jump to the front of the queue.
    runtime.onEvent.mock.calls[0]?.[0]?.({
      eventType: "COMBAT_RESOLVED",
      commandId: "human-cmd",
      playerId: "human-1",
      actionType: "ATTACK",
      originX: 5,
      originY: 5,
      targetX: 6,
      targetY: 5,
      attackerWon: true,
      combatResult: { defenderOwnerId: "ai-3" }
    });

    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-3", commandId: "ai-runtime-ai-3-1-1000" });
    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-1", commandId: "ai-runtime-ai-1-2-1000" });
    await producer.tick();
    producer.close();

    // ai-3 jumps ahead of ai-2 on tick 2 because COMBAT_RESOLVED marked it urgent.
    // After ai-3's urgent dispatch, nextPlayerIndex advances past ai-3 → tick 3 starts at ai-1
    // (pending was already cleared after tick 1). Tick 4 then reaches ai-2.
    expect(submittedPlayers).toEqual(["ai-1", "ai-3", "ai-1", "ai-2"]);
  });

  it("ignores COMBAT_RESOLVED events that don't represent a human capturing AI territory", async () => {
    const onEvent = vi.fn(() => () => undefined);
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1", "ai-2", "ai-3"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => 1_000,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-1", commandId: "ai-runtime-ai-1-1-1000" });

    // AI vs AI capture (ai-1 captures ai-3 tile) — should NOT trigger urgent priority.
    runtime.onEvent.mock.calls[0]?.[0]?.({
      eventType: "COMBAT_RESOLVED",
      commandId: "ai-1-cmd",
      playerId: "ai-1",
      actionType: "ATTACK",
      originX: 5,
      originY: 5,
      targetX: 6,
      targetY: 5,
      attackerWon: true,
      combatResult: { defenderOwnerId: "ai-3" }
    });

    // EXPAND result (claim, not capture from another player) — should NOT trigger.
    runtime.onEvent.mock.calls[0]?.[0]?.({
      eventType: "COMBAT_RESOLVED",
      commandId: "human-expand",
      playerId: "human-1",
      actionType: "EXPAND",
      originX: 0,
      originY: 0,
      targetX: 1,
      targetY: 0,
      attackerWon: true,
      combatResult: { defenderOwnerId: "ai-3" }
    });

    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-2", commandId: "ai-runtime-ai-2-1-1000" });
    await producer.tick();
    producer.close();

    // Normal round-robin order — neither AI-vs-AI capture nor EXPAND should bump anyone.
    expect(submittedPlayers).toEqual(["ai-1", "ai-2", "ai-3"]);
  });

  it("with intent-latch enabled, defers replanning a player while their previous frontier intent is still in its wake window", async () => {
    let nowMs = 1_000;
    const onEvent = vi.fn(() => () => undefined);
    // Each AI expands toward a different tile so the cross-AI reservation gate
    // doesn't accidentally block ai-2 here — this test is specifically about
    // the same-player wake-window deferral.
    const targetByPlayer: Record<string, { fromX: number; fromY: number; toX: number; toY: number }> = {
      "ai-1": { fromX: 0, fromY: 0, toX: 1, toY: 0 },
      "ai-2": { fromX: 10, fromY: 10, toX: 11, toY: 10 }
    };
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify(targetByPlayer[playerId]!)
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1", "ai-2"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => nowMs,
      tickIntervalMs: 10_000,
      territoryVersionForPlayer: () => 0
    });

    await producer.tick();
    // ai-1 is now latched on EXPAND (1,0) for 3500ms. Free up pending without releasing the latch.
    nowMs = 1_500;
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COLLECT_RESULT", playerId: "ai-1", commandId: "ai-runtime-ai-1-1-1000" });
    // Still inside the 3500ms wake window — ai-1 should be skipped, ai-2 takes the turn.
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-2"]);
  });

  it("with intent-latch enabled, releases the latch on COMBAT_RESOLVED for the same player", async () => {
    let nowMs = 1_000;
    const onEvent = vi.fn(() => () => undefined);
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => nowMs,
      tickIntervalMs: 10_000,
      territoryVersionForPlayer: () => 0
    });

    await producer.tick();
    nowMs = 1_500;
    // COMBAT_RESOLVED clears both the pending tracker and the latch — ai-1 can replan immediately.
    runtime.onEvent.mock.calls[0]?.[0]?.({
      eventType: "COMBAT_RESOLVED",
      commandId: "ai-runtime-ai-1-1-1000",
      playerId: "ai-1",
      actionType: "EXPAND",
      originX: 0,
      originY: 0,
      targetX: 1,
      targetY: 0,
      attackerWon: true
    });
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-1"]);
  });

  it("with intent-latch enabled, blocks a second AI from claiming a tile already reserved by another AI", async () => {
    const nowMs = 1_000;
    const onEvent = vi.fn(() => () => undefined);
    const submitCommand = vi.fn(async () => undefined);
    // Both AIs want to expand to the same target tile.
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 5, toY: 5 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1", "ai-2"],
      submitCommand,
      now: () => nowMs,
      tickIntervalMs: 10_000,
      territoryVersionForPlayer: () => 0
    });

    await producer.tick();
    // ai-1 reserved (5,5). Clear ai-1's pending so the loop reaches ai-2 next tick.
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COLLECT_RESULT", playerId: "ai-1", commandId: "ai-runtime-ai-1-1-1000" });
    await producer.tick();
    producer.close();

    // Only ai-1 dispatched — ai-2's planner returned the reserved tile, producer broke out without submitting.
    expect(submitCommand).toHaveBeenCalledTimes(1);
    expect(submitCommand.mock.calls[0]?.[0]?.playerId).toBe("ai-1");
  });

  it("with intent-latch enabled, invalidates a latched player when their territory version changes", async () => {
    let nowMs = 1_000;
    const territoryVersionByPlayer = new Map<string, number>([["ai-1", 5]]);
    const onEvent = vi.fn(() => () => undefined);
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => nowMs,
      tickIntervalMs: 10_000,
      territoryVersionForPlayer: (id) => territoryVersionByPlayer.get(id) ?? 0
    });

    await producer.tick();
    nowMs = 1_500;
    // Clear pending without releasing the latch (COMBAT_RESOLVED resolves pending for EXPAND).
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMBAT_RESOLVED", playerId: "ai-1", commandId: "ai-runtime-ai-1-1-1000" });
    // Bump territory version — runtime would do this on any tile change for this player.
    territoryVersionByPlayer.set("ai-1", 6);
    // Latch should now be invalidated by the version mismatch; ai-1 replans immediately.
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-1"]);
  });

  it("with intent-latch enabled, releases the latch on TILE_DELTA_BATCH (the SETTLE/BUILD resolution event)", async () => {
    let nowMs = 1_000;
    const onEvent = vi.fn(() => () => undefined);
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "SETTLE" as const,
        payloadJson: JSON.stringify({ x: 1, y: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => nowMs,
      tickIntervalMs: 10_000,
      territoryVersionForPlayer: () => 0
    });

    await producer.tick();
    nowMs = 1_500;
    // SETTLE resolves with TILE_DELTA_BATCH (no COMBAT_RESOLVED) — must release the latch.
    runtime.onEvent.mock.calls[0]?.[0]?.({
      eventType: "TILE_DELTA_BATCH",
      commandId: "ai-runtime-ai-1-1-1000",
      playerId: "ai-1",
      tileDeltas: []
    });
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-1"]);
  });

  it("with intent-latch enabled, does not latch BUILD_* commands so the AI can re-plan immediately after dispatching one", async () => {
    let nowMs = 1_000;
    const onEvent = vi.fn(() => () => undefined);
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "BUILD_FORT" as const,
        payloadJson: JSON.stringify({ x: 1, y: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => nowMs,
      tickIntervalMs: 10_000,
      territoryVersionForPlayer: () => 0
    });

    await producer.tick();
    nowMs = 1_500;
    // Build duration varies by structure; we deliberately don't latch BUILD_*. Pending tracker
    // is the only thing keeping the AI off the wheel — clearing it lets ai-1 dispatch again.
    runtime.onEvent.mock.calls[0]?.[0]?.({
      eventType: "TILE_DELTA_BATCH",
      commandId: "ai-runtime-ai-1-1-1000",
      playerId: "ai-1",
      tileDeltas: []
    });
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-1"]);
  });

  it("with intent-latch enabled, restores urgency if submitCommand throws after the urgent flag was consumed", async () => {
    let nowMs = 1_000;
    const onEvent = vi.fn(() => () => undefined);
    let submitShouldThrow = true;
    const submitCommand = vi.fn(async () => {
      if (submitShouldThrow) {
        submitShouldThrow = false;
        throw new Error("transient command-store error");
      }
    });
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "ATTACK" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1", "ai-2"],
      submitCommand,
      now: () => nowMs,
      tickIntervalMs: 10_000,
      territoryVersionForPlayer: () => 0
    });

    // Mark ai-2 urgent via a human-attacks-AI COMBAT_RESOLVED so it's at the front next tick.
    runtime.onEvent.mock.calls[0]?.[0]?.({
      eventType: "COMBAT_RESOLVED",
      commandId: "human-cmd",
      playerId: "human-1",
      actionType: "ATTACK",
      originX: 5,
      originY: 5,
      targetX: 6,
      targetY: 5,
      attackerWon: true,
      combatResult: { defenderOwnerId: "ai-2" }
    });

    // First tick: ai-2 (urgent) is selected, submit throws. Without the restore-on-error fix,
    // the urgent flag would be lost and ai-2 would have to wait for round-robin.
    await producer.tick();
    expect(submitCommand).toHaveBeenCalledTimes(1);
    expect(submitCommand.mock.calls[0]?.[0]?.playerId).toBe("ai-2");

    nowMs = 1_500;
    // Next tick: urgent was restored. ai-2 should still be ahead of ai-1.
    await producer.tick();
    producer.close();

    expect(submitCommand).toHaveBeenCalledTimes(2);
    expect(submitCommand.mock.calls[1]?.[0]?.playerId).toBe("ai-2");
  });

  it("does not submit while the producer is externally paused", async () => {
    const submitCommand = vi.fn(async () => undefined);
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn(() => ({
          commandId: "ai-runtime-ai-1-1-1000",
          sessionId: "ai-runtime:ai-1",
          playerId: "ai-1",
          clientSeq: 1,
          issuedAt: 1_000,
          type: "EXPAND",
          payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
        })),
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: () => () => undefined
      },
      aiPlayerIds: ["ai-1"],
      shouldRun: () => false,
      submitCommand,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    producer.close();

    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("reports diagnostics when planning returns no command", async () => {
    const onNoCommand = vi.fn();
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn(() => undefined),
        explainNextAutomationCommand: vi.fn(() => ({
          diagnostic: {
            playerId: "ai-1",
            sessionPrefix: "ai-runtime",
            frontierEnemyTargetCount: 0,
            frontierNeutralTargetCount: 0,
            canAttack: false,
            canExpand: false,
            noCommandReason: "no_frontier_targets" as const
          }
        })),
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: () => () => undefined
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      onNoCommand,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    producer.close();

    expect(onNoCommand).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: "ai-1", noCommandReason: "no_frontier_targets" })
    );
  });

  it("reports submitted AI command types after a successful submit", async () => {
    const onCommand = vi.fn();
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn(() => undefined),
        explainNextAutomationCommand: vi.fn((playerId: string, clientSeq: number, issuedAt: number) => ({
          command: {
            commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
            sessionId: `ai-runtime:${playerId}`,
            playerId,
            clientSeq,
            issuedAt,
            type: "BUILD_ECONOMIC_STRUCTURE" as const,
            payloadJson: JSON.stringify({ x: 1, y: 1, structureType: "MARKET" })
          },
          diagnostic: {
            playerId,
            sessionPrefix: "ai-runtime" as const,
            frontierEnemyTargetCount: 0,
            frontierNeutralTargetCount: 1,
            canAttack: false,
            canExpand: true
          }
        })),
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: () => () => undefined
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      onCommand,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    producer.close();

    expect(onCommand).toHaveBeenCalledWith({
      playerId: "ai-1",
      commandType: "BUILD_ECONOMIC_STRUCTURE"
    });
  });

  it("submits progression without consuming the same-tick gameplay action", async () => {
    const submittedTypes: string[] = [];
    let onEventHandler: ((event: { eventType: string; playerId: string; commandId: string }) => void) | undefined;
    const explainNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number, _sessionPrefix: string, options?: { skipPreplan?: boolean }) => {
        if (!options?.skipPreplan) {
          return {
            command: {
              commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
              sessionId: `ai-runtime:${playerId}`,
              playerId,
              clientSeq,
              issuedAt,
              type: "CHOOSE_TECH" as const,
              payloadJson: JSON.stringify({ techId: "toolmaking" })
            },
            diagnostic: {
              playerId,
              sessionPrefix: "ai-runtime" as const,
              frontierEnemyTargetCount: 0,
              frontierNeutralTargetCount: 0,
              canAttack: false,
              canExpand: false
            }
          };
        }
        return {
          command: {
            commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
            sessionId: `ai-runtime:${playerId}`,
            playerId,
            clientSeq,
            issuedAt,
            type: "EXPAND" as const,
            payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
          },
          diagnostic: {
            playerId,
            sessionPrefix: "ai-runtime" as const,
            frontierEnemyTargetCount: 0,
            frontierNeutralTargetCount: 1,
            canAttack: false,
            canExpand: true
          }
        };
      }
    );
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn(() => undefined),
        explainNextAutomationCommand,
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: (handler) => {
          onEventHandler = handler;
          return () => undefined;
        }
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedTypes.push(command.type);
      },
      now: () => 1_000,
      tickIntervalMs: 10_000
    });

    const tickPromise = producer.tick();
    await Promise.resolve();

    expect(submittedTypes).toEqual(["CHOOSE_TECH"]);
    expect(explainNextAutomationCommand).toHaveBeenCalledTimes(1);

    onEventHandler?.({
      eventType: "TECH_UPDATE",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-1-1000"
    });
    await tickPromise;
    producer.close();

    expect(submittedTypes).toEqual(["CHOOSE_TECH", "EXPAND"]);
    expect(explainNextAutomationCommand).toHaveBeenNthCalledWith(2, "ai-1", 2, expect.any(Number), "ai-runtime", { skipPreplan: true });
  });

  it("does not treat rejected tech preplan as applied same-tick progression", async () => {
    const submittedTypes: string[] = [];
    let onEventHandler: ((event: { eventType: string; playerId: string; commandId: string; code?: string }) => void) | undefined;
    const explainNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        command: {
          commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
          sessionId: `ai-runtime:${playerId}`,
          playerId,
          clientSeq,
          issuedAt,
          type: clientSeq === 1 ? ("CHOOSE_TECH" as const) : ("EXPAND" as const),
          payloadJson: clientSeq === 1
            ? JSON.stringify({ techId: "toolmaking" })
            : JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
        },
        diagnostic: {
          playerId,
          sessionPrefix: "ai-runtime" as const,
          frontierEnemyTargetCount: 0,
          frontierNeutralTargetCount: clientSeq === 1 ? 0 : 1,
          canAttack: false,
          canExpand: clientSeq !== 1
        }
      })
    );
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn(() => undefined),
        explainNextAutomationCommand,
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: (handler) => {
          onEventHandler = handler;
          return () => undefined;
        }
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedTypes.push(command.type);
      },
      now: () => 1_000,
      tickIntervalMs: 10_000
    });

    const firstTick = producer.tick();
    await Promise.resolve();
    onEventHandler?.({
      eventType: "COMMAND_REJECTED",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-1-1000",
      code: "TECH_INVALID"
    });
    await firstTick;

    expect(submittedTypes).toEqual(["CHOOSE_TECH"]);
    expect(explainNextAutomationCommand).toHaveBeenCalledTimes(1);

    await producer.tick();
    producer.close();

    expect(submittedTypes).toEqual(["CHOOSE_TECH", "EXPAND"]);
    expect(explainNextAutomationCommand).toHaveBeenNthCalledWith(2, "ai-1", 2, expect.any(Number), "ai-runtime", { skipPreplan: false });
  });

  it("advances client seq after a timed-out preplan command instead of replaying it", async () => {
    vi.useFakeTimers();
    const submittedTypes: string[] = [];
    const explainNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        command: {
          commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
          sessionId: `ai-runtime:${playerId}`,
          playerId,
          clientSeq,
          issuedAt,
          type: clientSeq === 1 ? ("CHOOSE_TECH" as const) : ("EXPAND" as const),
          payloadJson: clientSeq === 1
            ? JSON.stringify({ techId: "toolmaking" })
            : JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
        },
        diagnostic: {
          playerId,
          sessionPrefix: "ai-runtime" as const,
          frontierEnemyTargetCount: 0,
          frontierNeutralTargetCount: clientSeq === 1 ? 0 : 1,
          canAttack: false,
          canExpand: clientSeq !== 1
        }
      })
    );
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn(() => undefined),
        explainNextAutomationCommand,
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: () => () => undefined
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedTypes.push(command.type);
      },
      now: () => 1_000,
      tickIntervalMs: 10_000
    });

    const firstTick = producer.tick();
    await Promise.resolve();
    expect(submittedTypes).toEqual(["CHOOSE_TECH"]);

    await vi.advanceTimersByTimeAsync(5_001);
    await firstTick;
    await producer.tick();
    producer.close();
    vi.useRealTimers();

    expect(submittedTypes).toEqual(["CHOOSE_TECH", "EXPAND"]);
    expect(explainNextAutomationCommand).toHaveBeenNthCalledWith(2, "ai-1", 2, expect.any(Number), "ai-runtime", { skipPreplan: false });
  });

  it("releases stale pending AI commands so one stuck player does not freeze forever", async () => {
    let nowMs = 1_000;
    const submittedPlayers: string[] = [];
    const runtime = {
      chooseNextAutomationCommand: vi.fn((playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })),
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent: () => () => undefined
    };
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => nowMs,
      pendingCommandTimeoutMs: 100,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    nowMs = 1_150;
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-1"]);
  });
});
