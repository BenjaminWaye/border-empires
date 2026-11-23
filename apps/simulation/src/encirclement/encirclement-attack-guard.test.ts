/**
 * Encirclement G-group: attack/expand source guard, run against SimulationRuntime
 * (split out of encirclement.test.ts).
 */
import { describe, expect, it, vi } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { ENCIRCLEMENT_DECAY_MS_LOCAL, mkRuntime, player } from "./encirclement-runtime.test-helpers.js";

// ---------------------------------------------------------------------------
// G-group: attack source guard (integration with SimulationRuntime)
// ---------------------------------------------------------------------------

describe("encirclement attack guard", () => {
  it("G1: cannot use a cut-off (blinking) tile as attack source", async () => {
    const now = { value: 1_000 };
    const runtime = new SimulationRuntime({
      now: () => now.value,
      initialPlayers: new Map([
        ["player-1", player("player-1")],
        ["player-2", player("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          // player-1 has a frontier tile with encirclement timer set
          {
            x: 10, y: 10, terrain: "LAND",
            ownerId: "player-1", ownershipState: "FRONTIER",
            frontierDecayAt: 1_000 + ENCIRCLEMENT_DECAY_MS_LOCAL, // 60 s from now
            frontierDecayKind: "ENCIRCLEMENT"
          },
          // player-2 target
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          // Distant settled land keeps player-1 alive when the cut-off origin decays.
          { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "attack-from-cutoff",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();

    const rejected = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejected).toBeDefined();
    expect(rejected).toMatchObject({ code: "ORIGIN_CUT_OFF" });
  });

  it("G3: attacks against a blinking tile proceed normally", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0); // attacker always wins
    try {
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([
          ["player-1", player("player-1")],
          ["player-2", player("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            // player-1 source — normal settled tile
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            // player-2 target — cut off / blinking
            {
              x: 11, y: 10, terrain: "LAND",
              ownerId: "player-2", ownershipState: "FRONTIER",
              frontierDecayAt: Date.now() + ENCIRCLEMENT_DECAY_MS_LOCAL,
              frontierDecayKind: "ENCIRCLEMENT"
            }
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      runtime.submitCommand({
        commandId: "attack-against-cutoff",
        sessionId: "s1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: Date.now(),
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });
      await Promise.resolve();

      expect(events.find((e) => e.eventType === "COMMAND_ACCEPTED")).toBeDefined();
      expect(events.find((e) => e.eventType === "COMMAND_REJECTED")).toBeUndefined();

      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const combatResolved = events.find((e) => e.eventType === "COMBAT_RESOLVED");
      expect(combatResolved).toBeDefined();
      // biome-ignore lint: safe cast, event type checked above
      expect((combatResolved as Extract<SimulationEvent, { eventType: "COMBAT_RESOLVED" }>).attackerWon).toBe(true);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  // G1b: EXPAND from a blinking tile is blocked with ORIGIN_CUT_OFF.
  it("G1b: EXPAND from a cut-off (blinking) tile is rejected with ORIGIN_CUT_OFF", async () => {
    const runtime = mkRuntime([
      {
        x: 10, y: 10, terrain: "LAND",
        ownerId: "player-1", ownershipState: "FRONTIER",
        frontierDecayAt: 1_000 + ENCIRCLEMENT_DECAY_MS_LOCAL,
        frontierDecayKind: "ENCIRCLEMENT"
      },
      // neutral target adjacent to origin
      { x: 11, y: 10, terrain: "LAND" },
      // Distant settled land keeps player-1 alive when the cut-off origin decays.
      { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
    ]);
    const events: SimulationEvent[] = [];
    runtime.onEvent((e) => events.push(e));

    runtime.submitCommand({
      commandId: "expand-from-cutoff",
      sessionId: "s1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();

    const rejected = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejected).toBeDefined();
    expect(rejected).toMatchObject({ code: "ORIGIN_CUT_OFF" });
  });

  // Regression: EXPAND from a normal (non-blinking) frontier tile still succeeds.
  it("G1b-regression: EXPAND from a non-blinking frontier tile is accepted", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", player("player-1")]]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            // player-1 origin — normal frontier tile, supplied by adjacent settled tile
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            // neutral target
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((e) => events.push(e));

      runtime.submitCommand({
        commandId: "expand-normal",
        sessionId: "s1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: Date.now(),
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });
      await Promise.resolve();

      expect(events.find((e) => e.eventType === "COMMAND_ACCEPTED")).toBeDefined();
      expect(events.find((e) => e.eventType === "COMMAND_REJECTED")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
