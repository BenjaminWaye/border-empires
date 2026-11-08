import type { DomainTileState } from "@border-empires/game-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pins that the simulation's authoritative combat roll gets the terrain terms
// (hills defense / river crossing, terrain-combat.ts) for the lock's own
// origin -> target pair. The terrain math itself is covered in
// packages/shared/src/terrain-combat/terrain-combat.test.ts; it's stubbed
// here so the test doesn't build a whole world.
const terrainCalls: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
const rolledModifiers: Array<Record<string, unknown>> = [];
vi.mock("@border-empires/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@border-empires/shared")>();
  return {
    ...actual,
    terrainCombatModifiers: (origin: { x: number; y: number }, target: { x: number; y: number }) => {
      terrainCalls.push([origin, target]);
      return { hillsDefenseMult: actual.HILLS_DEFENSE_MULT, riverCrossingAttackMult: actual.RIVER_CROSSING_ATTACK_MULT };
    },
    rollFrontierCombat: (...args: Parameters<typeof actual.rollFrontierCombat>) => {
      rolledModifiers.push({ ...(args[3] ?? {}) });
      return actual.rollFrontierCombat(...args);
    }
  };
});

const { HILLS_DEFENSE_MULT, RIVER_CROSSING_ATTACK_MULT } = await import("@border-empires/shared");
const { buildLockedCombatResolution } = await import("./runtime-combat-support.js");
const { simulationTileKey } = await import("./seed-state/seed-state.js");
const { CombatLockIndex } = await import("./combat-lock-index/combat-lock-index.js");
type Ctx = Parameters<typeof buildLockedCombatResolution>[0];

const ATTACKER_ID = "player-attacker";
const DEFENDER_ID = "player-defender";
const TARGET_KEY = simulationTileKey(6, 5);

const makeContext = (): Ctx => ({
  now: () => 0,
  players: new Map([
    [ATTACKER_ID, { id: ATTACKER_ID, isAi: false, points: 0, manpower: 100, techIds: new Set(), allies: new Set() }],
    [DEFENDER_ID, { id: DEFENDER_ID, isAi: false, points: 0, manpower: 100, techIds: new Set(), allies: new Set() }]
  ]),
  tiles: new Map<string, DomainTileState>([[TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "SETTLED" }]]),
  musterTilesByOwner: new Map(),
  musterReservedByKey: new Map(),
  locksByTile: new CombatLockIndex(),
  locksByCommandId: new Map(),
  barbarianTileProgress: new Map(),
  summaryForPlayer: () => ({ settledTileCount: 1, territoryTileKeys: new Set() }) as ReturnType<Ctx["summaryForPlayer"]>,
  replaceTileState: () => {},
  tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
  tileDeltaRevealOnly: (tile) => ({ x: tile.x, y: tile.y }),
  emitEvent: () => {},
  emitPlayerStateUpdate: () => {},
  isStructureDormant: () => false,
  manpowerLossByTileKey: new Map(),
  ownedStructureCountForPlayer: () => 0
});

describe("buildLockedCombatResolution -- terrain terms", () => {
  beforeEach(() => {
    terrainCalls.length = 0;
    rolledModifiers.length = 0;
  });

  it("rolls a settled-tile attack with the lock's hills/river terms", () => {
    buildLockedCombatResolution(makeContext(), {
      actionType: "ATTACK",
      commandId: "attack-1",
      playerId: ATTACKER_ID,
      manpowerCost: 40,
      originKey: simulationTileKey(5, 5),
      originX: 5,
      originY: 5,
      targetX: 6,
      targetY: 5,
      targetKey: TARGET_KEY
    });
    expect(terrainCalls).toEqual([[{ x: 5, y: 5 }, { x: 6, y: 5 }]]);
    expect(rolledModifiers).toHaveLength(1);
    expect(rolledModifiers[0]).toMatchObject({ hillsDefenseMult: HILLS_DEFENSE_MULT, riverCrossingAttackMult: RIVER_CROSSING_ATTACK_MULT });
  });
});
