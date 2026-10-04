import { describe, expect, it } from "vitest";
import { planetaryDefenseEngagedTileKeys, type PlanetaryDefenseEngagementState } from "./client-map-3d-planetary-defense-engagement.js";
import type { ActiveBattleOverlay } from "./client-battle-overlay/client-battle-overlay.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const NOW = 1000;
const EPOCH = 1_800_000_000_000;

const battle = (overrides: Partial<ActiveBattleOverlay>): ActiveBattleOverlay => ({
  originX: 4,
  originY: 5,
  targetX: 5,
  targetY: 5,
  attackerOwnerId: "barbarian-1",
  defenderOwnerId: "player-1",
  attackerWon: true,
  startAt: 0,
  clashAt: 0,
  endAt: 2000,
  fromSkirmish: false,
  ...overrides
});

const stateWith = (overrides: Partial<PlanetaryDefenseEngagementState>): PlanetaryDefenseEngagementState => ({
  tiles: new Map(),
  activeBattles: new Map(),
  incomingAttacksByTile: new Map(),
  outgoingMusterAttacksByTile: new Map(),
  capture: undefined,
  ...overrides
});

const barbTile = (x: number, y: number) => [keyFor(x, y), { x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }] as const;

describe("planetaryDefenseEngagedTileKeys", () => {
  it("marks both the origin and target of a live Planetary Defense battle, in either role", () => {
    const state = stateWith({
      activeBattles: new Map([
        ["5,5", battle({})],
        ["9,9", battle({ originX: 8, originY: 9, targetX: 9, targetY: 9, attackerOwnerId: "player-1", defenderOwnerId: "barbarian-1" })]
      ])
    });
    expect(planetaryDefenseEngagedTileKeys(state, keyFor, NOW, EPOCH)).toEqual(new Set(["4,5", "5,5", "8,9", "9,9"]));
  });

  it("ignores battles between players and battles that have already ended", () => {
    const state = stateWith({
      activeBattles: new Map([
        ["5,5", battle({ attackerOwnerId: "player-2" })],
        ["7,7", battle({ targetX: 7, targetY: 7, endAt: 500 })]
      ])
    });
    expect(planetaryDefenseEngagedTileKeys(state, keyFor, NOW, EPOCH).size).toBe(0);
  });

  it("marks a Planetary Defense attack's siege countdown before it resolves (its squad is already drawn)", () => {
    const state = stateWith({
      incomingAttacksByTile: new Map([
        ["5,5", { attackerName: "Planetary Defense", attackerId: "barbarian-1", resolvesAt: EPOCH + 10_000, fromX: 4, fromY: 5 }],
        ["8,8", { attackerName: "Rival", attackerId: "player-2", resolvesAt: EPOCH + 10_000, fromX: 7, fromY: 8 }],
        ["9,9", { attackerName: "Planetary Defense", attackerId: "barbarian-1", resolvesAt: EPOCH - 1, fromX: 8, fromY: 9 }]
      ])
    });
    expect(planetaryDefenseEngagedTileKeys(state, keyFor, NOW, EPOCH)).toEqual(new Set(["5,5", "4,5"]));
  });

  it("marks the Planetary Defense tile this player is attacking, manually or from a muster flag", () => {
    const state = stateWith({
      tiles: new Map([barbTile(6, 6), barbTile(7, 7), barbTile(8, 8)]) as never,
      capture: { startAt: 0, resolvesAt: EPOCH + 5000, target: { x: 6, y: 6 }, origin: { x: 5, y: 6 }, actionType: "ATTACK" },
      outgoingMusterAttacksByTile: new Map([
        ["7,7", { originX: 6, originY: 7, targetX: 7, targetY: 7, resolvesAt: EPOCH + 5000 }],
        // Still marching: the transit overlay draws it, not a skirmish.
        ["8,8", { originX: 7, originY: 8, targetX: 8, targetY: 8, resolvesAt: EPOCH + 5000, transitEndsAt: EPOCH + 1000 }]
      ])
    });
    expect(planetaryDefenseEngagedTileKeys(state, keyFor, NOW, EPOCH)).toEqual(new Set(["6,6", "7,7"]));
  });
});
