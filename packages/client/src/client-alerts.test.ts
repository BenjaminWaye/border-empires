import { describe, expect, it } from "vitest";

import { combatResolutionAlert } from "./client-alerts.js";
import type { Tile } from "./client-types.js";

describe("combatResolutionAlert", () => {
  it("uses the actual town name and focus coordinates for town captures", () => {
    const result = combatResolutionAlert(
      {
        attackType: "ATTACK",
        attackerWon: true,
        defenderOwnerId: "enemy",
        target: { x: 18, y: 42 },
        changes: [{ x: 18, y: 42, ownerId: "me", ownershipState: "SETTLED" }]
      },
      {
        targetTileBefore: {
          x: 18,
          y: 42,
          terrain: "LAND",
          ownerId: "enemy",
          ownershipState: "SETTLED",
          town: {
            name: "Aetherwick",
            type: "MARKET",
            baseGoldPerMinute: 2,
            supportCurrent: 0,
            supportMax: 0,
            goldPerMinute: 2,
            cap: 40,
            isFed: true,
            population: 18000,
            maxPopulation: 50000,
            populationTier: "TOWN",
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }
        } as Tile,
        originTileBefore: undefined
      },
      {
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "enemy" ? "Enemy Empire" : undefined),
        prettyToken: (value: string) => value,
        resourceLabel: (value: string) => value,
        terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
        terrainAt: () => "LAND",
        tiles: new Map(),
        keyFor: (x: number, y: number) => `${x},${y}`
      }
    );

    expect(result.detail).toBe("Aetherwick was conquered from Enemy Empire.");
    expect(result.focusX).toBe(18);
    expect(result.focusY).toBe(42);
    expect(result.actionLabel).toBe("Center");
  });

  it("adds pillaged gold and strategic resources to successful attack details", () => {
    const result = combatResolutionAlert(
      {
        attackType: "ATTACK",
        attackerWon: true,
        defenderOwnerId: "enemy",
        target: { x: 18, y: 42 },
        pillagedGold: 132.5,
        pillagedStrategic: {
          FOOD: 4,
          IRON: 1.5
        }
      },
      {
        targetTileBefore: {
          x: 18,
          y: 42,
          terrain: "LAND",
          ownerId: "enemy",
          ownershipState: "SETTLED",
          town: {
            name: "Aetherwick",
            type: "MARKET",
            baseGoldPerMinute: 2,
            supportCurrent: 0,
            supportMax: 0,
            goldPerMinute: 2,
            cap: 40,
            isFed: true,
            population: 18000,
            maxPopulation: 50000,
            populationTier: "TOWN",
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }
        } as Tile,
        originTileBefore: undefined
      },
      {
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "enemy" ? "Enemy Empire" : undefined),
        prettyToken: (value: string) => value,
        resourceLabel: (value: string) => value,
        terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
        terrainAt: () => "LAND",
        tiles: new Map(),
        keyFor: (x: number, y: number) => `${x},${y}`
      }
    );

    expect(result.detail).toBe("Aetherwick was conquered from Enemy Empire. Plundered ◉ 132.50, 🍞 4 FOOD, ⛏ 1.50 IRON.");
  });
});
