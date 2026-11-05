import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { buildLockedCombatResolution, type RuntimeCombatSupportContext } from "./runtime-combat-support.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { CombatLockIndex } from "./combat-lock-index/combat-lock-index.js";

// The combat broadcast's per-side war gear comes from the lock's combat
// resolution; this pins that buildLockedCombatResolution actually puts it
// there (battleWarGearFor itself is covered in
// runtime-weapons-factory-mults.test.ts).
const ATTACKER_ID = "player-attacker";
const DEFENDER_ID = "player-defender";
const ORIGIN_KEY = simulationTileKey(5, 5);
const TARGET_KEY = simulationTileKey(6, 5);

const makeContext = (factoriesByOwner: Record<string, string[]>): RuntimeCombatSupportContext => ({
  now: () => 0,
  players: new Map([
    [ATTACKER_ID, { id: ATTACKER_ID, isAi: false, points: 0, manpower: 100, techIds: new Set(), allies: new Set() }],
    [DEFENDER_ID, { id: DEFENDER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() }]
  ]),
  tiles: new Map<string, DomainTileState>([[TARGET_KEY, { x: 6, y: 5, terrain: "LAND", ownerId: DEFENDER_ID, ownershipState: "FRONTIER" }]]),
  musterTilesByOwner: new Map(),
  musterReservedByKey: new Map(),
  locksByTile: new CombatLockIndex(),
  locksByCommandId: new Map(),
  barbarianTileProgress: new Map(),
  summaryForPlayer: () => ({ settledTileCount: 1, territoryTileKeys: new Set() }) as ReturnType<RuntimeCombatSupportContext["summaryForPlayer"]>,
  replaceTileState: () => {},
  tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
  tileDeltaRevealOnly: (tile) => ({ x: tile.x, y: tile.y }),
  emitEvent: () => {},
  emitPlayerStateUpdate: () => {},
  isStructureDormant: () => false,
  manpowerLossByTileKey: new Map(),
  ownedStructureCountForPlayer: (ownerId, structureType) => (factoriesByOwner[ownerId]?.includes(structureType) ? 1 : 0)
});

const attack = (context: RuntimeCombatSupportContext) =>
  buildLockedCombatResolution(context, {
    actionType: "ATTACK",
    commandId: "attack-1",
    playerId: ATTACKER_ID,
    manpowerCost: 0,
    originKey: ORIGIN_KEY,
    originX: 5,
    originY: 5,
    targetX: 6,
    targetY: 5,
    targetKey: TARGET_KEY
  });

describe("buildLockedCombatResolution -- battle war gear", () => {
  it("puts each side's weapons-factory gear on the resolution", () => {
    const resolution = attack(
      makeContext({
        [ATTACKER_ID]: ["TITANIUM_WEAPONS_FACTORY"],
        [DEFENDER_ID]: ["TITANIUM_WEAPONS_FACTORY", "UMBRITE_WEAPONS_FACTORY"]
      })
    );
    expect(resolution?.attackerGear).toEqual({ titaniumArmor: true });
    expect(resolution?.defenderGear).toEqual({ titaniumArmor: true, umbriteArms: true });
  });

  it("omits gear for a side with no weapons factory", () => {
    const resolution = attack(makeContext({}));
    expect(resolution).toBeDefined();
    expect(resolution && "attackerGear" in resolution).toBe(false);
    expect(resolution && "defenderGear" in resolution).toBe(false);
  });
});
