/**
 * End-to-end through the real runtime: tickAetherShields pushes each
 * subscribed player the OTHER players' shielding towers whose shielded land
 * they can see -- including a tower outside their own vision -- and nothing
 * for towers whose land they can't see.
 */
import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import type { RuntimePlayer } from "../runtime-types.js";

const VIEWER = "player-1";
const ENEMY = "player-2";
const FAR_ENEMY = "player-3";

const settled = (x: number, y: number, ownerId: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED", ...extra
});

const tiles = [
  settled(0, 0, VIEWER, { town: { name: "Viewerton", type: "MARKET", populationTier: "SETTLEMENT" } }),
  // Enemy land right next to the viewer: visible to them.
  settled(1, 1, ENEMY),
  // A tower 14 tiles away, out of the viewer's sight, shielding that land.
  settled(15, 1, ENEMY, { observatory: { ownerId: ENEMY, status: "active", activatedAt: 1_000 } }),
  settled(15, 2, ENEMY, { resource: "GEMS" }),
  // Another player's tower far away: none of its land is in view.
  settled(80, 80, FAR_ENEMY, { observatory: { ownerId: FAR_ENEMY, status: "active", activatedAt: 1_000 } }),
  settled(80, 81, FAR_ENEMY, { resource: "GEMS" })
] as RecoveredSimulationState["tiles"];

const players = (): Map<string, RuntimePlayer> =>
  new Map([
    [VIEWER, buildPlayer(VIEWER, { points: 1_000 })],
    [ENEMY, buildPlayer(ENEMY, { points: 1_000 })],
    [FAR_ENEMY, buildPlayer(FAR_ENEMY, { points: 1_000 })]
  ]);

const shieldMessages = (events: SimulationEvent[], playerId: string): Array<{ towers: Array<{ x: number; y: number; ownerId: string }> }> =>
  events
    .filter((event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "AETHER_SHIELDS" && event.playerId === playerId)
    .map((event) => JSON.parse((event as { payloadJson: string }).payloadJson));

describe("tickAetherShields", () => {
  it("tells a subscribed player about an enemy tower shielding land they can see, even with the tower in fog", () => {
    const runtime = new SimulationRuntime({
      now: () => 10_000,
      initialPlayers: players(),
      initialState: { tiles, activeLocks: [] },
      isPlayerSubscribed: (playerId) => playerId === VIEWER
    });
    expect(runtime.isStructureDormant(ENEMY, "15,1", "observatory")).toBe(false);
    expect(runtime.isStructureDormant(FAR_ENEMY, "80,80", "observatory")).toBe(false);
    const seen = collectEvents(runtime);
    runtime.tickAetherShields(10_000);
    const messages = shieldMessages(seen, VIEWER);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.towers).toEqual([{ x: 15, y: 1, ownerId: ENEMY }]);
    // Not subscribed: nothing pushed.
    expect(shieldMessages(seen, ENEMY)).toHaveLength(0);
  });
});
