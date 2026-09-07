import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { COMBAT_LOCK_MS, MUSTER_TRANSIT_MS_PER_TILE } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";

// ADVANCE/MARCH auto-fire has no client-side pre-send gate to wait on the
// way a manually-clicked attack does (client-muster-transit.ts's
// armMusterTransit), so runtime-frontier-command.ts adds a mechanical
// travel-time delay to the combat lock's resolvesAt instead -- these tests
// cover that delay and that it's scoped to system-automation attacks only.

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const commandAcceptedFor = (seen: SimulationEvent[], commandId: string) =>
  seen.find(
    (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
      event.eventType === "COMMAND_ACCEPTED" && event.commandId === commandId
  );

describe("ADVANCE auto-fire mechanical travel-time delay", () => {
  it("delays resolution and reports transitEndsAt/musterOrigin when the flag fires directly (1-tile floor)", () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      runtime.tickMuster(1_000);

      const accepted = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
          event.eventType === "COMMAND_ACCEPTED" && event.actionType === "ATTACK"
      );
      expect(accepted).toBeDefined();
      // Flag fires from its own tile (adjacent to the target) — 1-tile floor.
      const expectedTransitMs = 1 * MUSTER_TRANSIT_MS_PER_TILE;
      expect(accepted?.transitEndsAt).toBe(1_000 + expectedTransitMs);
      expect(accepted?.musterOriginX).toBe(10);
      expect(accepted?.musterOriginY).toBe(10);
      expect(accepted?.resolvesAt).toBe(1_000 + COMBAT_LOCK_MS + expectedTransitMs);

      // Not resolved yet at the un-delayed COMBAT_LOCK_MS mark.
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11)?.ownerId).toBe("player-2");

      // Resolved once the added transit time has also elapsed.
      vi.advanceTimersByTime(expectedTransitMs);
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11)?.ownerId).toBe("player-1");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("delays resolution proportionally to the funding flag's distance from the firing tile when funded remotely", () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // Flag at (0,0); owned chain to a firing tile 3 hops away, adjacent to
      // the enemy target — same layout style as PR 1's nearest-target test.
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            {
              x: 0,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
            },
            { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 2, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 4, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      runtime.tickMuster(1_000);

      const accepted = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
          event.eventType === "COMMAND_ACCEPTED" && event.actionType === "ATTACK"
      );
      expect(accepted).toBeDefined();
      // Firing tile is (3,0) -- 3 tiles from the flag at (0,0).
      const expectedTransitMs = 3 * MUSTER_TRANSIT_MS_PER_TILE;
      expect(accepted?.transitEndsAt).toBe(1_000 + expectedTransitMs);
      expect(accepted?.musterOriginX).toBe(0);
      expect(accepted?.musterOriginY).toBe(0);
      expect(accepted?.resolvesAt).toBe(1_000 + COMBAT_LOCK_MS + expectedTransitMs);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  // Defender-visibility regression: the defender's ATTACK_ALERT should carry
  // transitEndsAt so the client can hold the incoming-attack skirmish's
  // approach plateau open for the real travel window -- without ever
  // exposing the attacker's musterOrigin/exact flag position to the
  // defender (only fromX/fromY, the firing tile, which the skirmish
  // overlay already renders direction-only).
  it("includes transitEndsAt (but not musterOrigin) in the defender's ATTACK_ALERT for an auto-fired attack", () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      runtime.tickMuster(1_000);

      const alert = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> =>
          event.eventType === "PLAYER_MESSAGE" && event.messageType === "ATTACK_ALERT"
      );
      expect(alert).toBeDefined();
      const payload = JSON.parse(alert!.payloadJson) as Record<string, unknown>;
      const expectedTransitMs = 1 * MUSTER_TRANSIT_MS_PER_TILE;
      expect(payload.transitEndsAt).toBe(1_000 + expectedTransitMs);
      expect(payload).not.toHaveProperty("musterOrigin");
      expect(payload).not.toHaveProperty("musterOriginX");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not delay a manually-submitted ATTACK -- only system-automation (ADVANCE/MARCH) commands", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 60, mode: "HOLD", updatedAt: 1_000 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));
      runtime.submitCommand({
        commandId: "manual-attack",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();

      const accepted = commandAcceptedFor(seen, "manual-attack");
      expect(accepted).toBeDefined();
      expect(accepted?.transitEndsAt).toBeUndefined();
      expect(accepted?.musterOriginX).toBeUndefined();
      expect(accepted?.resolvesAt).toBe(1_000 + COMBAT_LOCK_MS);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
