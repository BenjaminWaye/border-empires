import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// §15: finalized design — single target chosen by the caster (identified
// by a rival-owned tile at fromX/fromY -> toX/toY, same origin->target
// shape as World Engine Strike/Airport Bombard), takes 100% of the
// target's GOLD, 24hr cooldown, free activation (no CRYSTAL cost, §17).
//
// Split out of runtime.test.ts (which was already over the repo's 500-line
// soft cap) so this rewrite's test additions don't grow that file further —
// see scripts/check-file-line-limits.mjs.
describe("imperial exchange levy", () => {
  const buildLevyRuntime = (options: {
    techIds?: string[];
    omitTower?: boolean;
    rivalGold?: Record<string, number>;
    allies?: string[];
    truces?: string[];
  } = {}): SimulationRuntime => {
    const tiles: Array<Record<string, unknown>> = [
      {
        x: 0,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "IMPERIAL_EXCHANGE", status: "active" }
      },
      // §5.4: CRYSTAL supply so IMPERIAL_EXCHANGE (4 slots, post-part-
      // consumption rebalance)/AETHER_TOWER aren't dormant.
      { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 8, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      // §5.4: FOOD supply so AETHER_TOWER (1 FOOD slot) isn't dormant.
      { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
    ];
    if (!options.omitTower) {
      tiles.push({
        x: 1,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
      });
    }
    const players = new Map<string, Record<string, unknown>>();
    players.set(
      "player-1",
      buildPlayer("player-1", {
        points: 10_000,
        manpower: 10_000,
        techIds: new Set<string>(options.techIds ?? ["exchange-levy"]),
        allies: new Set<string>(options.allies ?? []),
        truces: new Set<string>(options.truces ?? [])
      })
    );
    let targetX = 10;
    for (const [pid, gold] of Object.entries(options.rivalGold ?? {})) {
      tiles.push({ x: targetX, y: 0, terrain: "LAND", ownerId: pid, ownershipState: "SETTLED" });
      players.set(pid, {
        id: pid,
        isAi: true,
        points: gold,
        manpower: 100,
        techIds: new Set<string>(),
        domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local",
        allies: new Set<string>(),
        truces: new Set<string>()
      });
      targetX += 1;
    }
    return new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: players as never,
      initialState: { tiles: tiles as never, activeLocks: [] }
    });
  };

  const targetTileFor = (index: number): { toX: number; toY: number } => ({ toX: 10 + index, toY: 0 });

  it("succeeds without any tech at all (levy is inherent to the built monument, Exchange Levy Writs was cut)", async () => {
    const runtime = buildLevyRuntime({ techIds: [], rivalGold: { "player-2": 100 } });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, ...targetTileFor(0) })
    });
    await Promise.resolve();
    expect(events).not.toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-1",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID"
    }));
  });

  it("succeeds with no Aether Tower nearby (the Exchange's levy isn't gated on the unrelated plastics/Aether Tower branch — #1820)", async () => {
    const runtime = buildLevyRuntime({ omitTower: true, rivalGold: { "player-2": 100 } });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, ...targetTileFor(0) })
    });
    await Promise.resolve();
    expect(events).not.toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-2",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID"
    }));
    const state = runtime.exportState();
    expect(state.players.find((p) => p.id === "player-2")?.points).toBe(0);
  });

  it("takes 100% of the chosen target's gold, applies a 24hr cooldown, and sends the victim an offline notification", async () => {
    const runtime = buildLevyRuntime({ rivalGold: { "player-2": 240, "player-3": 40 } });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-3",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, ...targetTileFor(0) })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const p1 = state.players.find((p) => p.id === "player-1");
    const p2 = state.players.find((p) => p.id === "player-2");
    const p3 = state.players.find((p) => p.id === "player-3");
    // 100% of player-2's 240 gold moves to player-1; player-3 (untouched) is unaffected.
    expect(p1?.points).toBe(10_240);
    expect(p2?.points).toBe(0);
    expect(p3?.points).toBe(40);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "PLAYER_MESSAGE",
      playerId: "player-2",
      messageType: "IMPERIAL_EXCHANGE_LEVY_EVENT"
    }));
    const victimMessage = events.find(
      (event) => event.eventType === "PLAYER_MESSAGE" && event.playerId === "player-2"
    ) as { payloadJson: string } | undefined;
    expect(JSON.parse(victimMessage?.payloadJson ?? "{}")).toMatchObject({ byPlayerId: "player-1", goldLost: 240 });
    // Second invocation (even against a different target) should be on cooldown.
    const secondEvents: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => secondEvents.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-3b",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, ...targetTileFor(1) })
    });
    await Promise.resolve();
    expect(secondEvents).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-3b",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
      message: "ability on cooldown"
    }));
  });

  it("does not target an ally", async () => {
    const runtime = buildLevyRuntime({ rivalGold: { "player-2": 100 }, allies: ["player-2"] });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-ally",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, ...targetTileFor(0) })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-ally",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
      message: "select a valid rival target"
    }));
    const state = runtime.exportState();
    expect(state.players.find((p) => p.id === "player-2")?.points).toBe(100);
  });

  it("does not target a truced player", async () => {
    const runtime = buildLevyRuntime({ rivalGold: { "player-2": 100 }, truces: ["player-2"] });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-truce",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, ...targetTileFor(0) })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-truce",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
      message: "select a valid rival target"
    }));
  });
});
