import { describe, expect, it } from "vitest";
import { triggerSiegeBombardmentForNewBattle, SIEGE_AIM_DURATION_MS } from "./client-siege-bombardment.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (value: number): number => value;

const siegeOutpostTile = (x: number, y: number, ownerId: string): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  siegeOutpost: { ownerId, status: "active" }
});

const battle = { attackerOwnerId: "attacker", targetX: 5, targetY: 4 };

describe("triggerSiegeBombardmentForNewBattle", () => {
  it("aims the nearest attacker-owned battery and queues the purple bombard FX", () => {
    const battery = siegeOutpostTile(5, 5, "attacker");
    const fortDeps = { tiles: new Map<string, Tile>([[keyFor(battery.x, battery.y), battery]]), keyFor, wrapX: wrap, wrapY: wrap };
    const state = { siegeAimOverrides: new Map<string, { targetX: number; targetY: number; expiresAt: number }>(), siegeBombardFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }> };

    triggerSiegeBombardmentForNewBattle(state, fortDeps, battle, 1000);

    expect(state.siegeAimOverrides.get(keyFor(5, 5))).toEqual({ targetX: 5, targetY: 4, expiresAt: 1000 + SIEGE_AIM_DURATION_MS });
    expect(state.siegeBombardFxQueue).toHaveLength(1);
    expect(state.siegeBombardFxQueue[0]).toMatchObject({ x: 5, y: 4 });
  });

  it("no-ops when no attacker-owned siege structure is in range", () => {
    const fortDeps = { tiles: new Map<string, Tile>(), keyFor, wrapX: wrap, wrapY: wrap };
    const state = { siegeAimOverrides: new Map<string, { targetX: number; targetY: number; expiresAt: number }>(), siegeBombardFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }> };

    triggerSiegeBombardmentForNewBattle(state, fortDeps, battle, 1000);

    expect(state.siegeAimOverrides.size).toBe(0);
    expect(state.siegeBombardFxQueue).toHaveLength(0);
  });

  it("retargets to the most recent battle when a battery is in range of two", () => {
    const battery = siegeOutpostTile(5, 5, "attacker");
    const fortDeps = { tiles: new Map<string, Tile>([[keyFor(battery.x, battery.y), battery]]), keyFor, wrapX: wrap, wrapY: wrap };
    const state = { siegeAimOverrides: new Map<string, { targetX: number; targetY: number; expiresAt: number }>(), siegeBombardFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }> };

    triggerSiegeBombardmentForNewBattle(state, fortDeps, { attackerOwnerId: "attacker", targetX: 4, targetY: 5 }, 1000);
    triggerSiegeBombardmentForNewBattle(state, fortDeps, { attackerOwnerId: "attacker", targetX: 6, targetY: 5 }, 1000);

    expect(state.siegeAimOverrides.size).toBe(1);
    expect(state.siegeAimOverrides.get(keyFor(5, 5))).toMatchObject({ targetX: 6, targetY: 5 });
    expect(state.siegeBombardFxQueue).toHaveLength(2);
  });

  it("prunes expired overrides so the map doesn't grow unbounded", () => {
    const batteryA = siegeOutpostTile(5, 5, "attacker");
    const batteryB = siegeOutpostTile(50, 50, "attacker");
    const fortDeps = {
      tiles: new Map<string, Tile>([
        [keyFor(batteryA.x, batteryA.y), batteryA],
        [keyFor(batteryB.x, batteryB.y), batteryB]
      ]),
      keyFor,
      wrapX: wrap,
      wrapY: wrap
    };
    const state = { siegeAimOverrides: new Map<string, { targetX: number; targetY: number; expiresAt: number }>(), siegeBombardFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }> };

    triggerSiegeBombardmentForNewBattle(state, fortDeps, { attackerOwnerId: "attacker", targetX: 4, targetY: 5 }, 1000);
    triggerSiegeBombardmentForNewBattle(state, fortDeps, { attackerOwnerId: "attacker", targetX: 51, targetY: 50 }, 1000 + SIEGE_AIM_DURATION_MS + 1);

    expect(state.siegeAimOverrides.size).toBe(1);
    expect(state.siegeAimOverrides.has(keyFor(50, 50))).toBe(true);
  });
});
