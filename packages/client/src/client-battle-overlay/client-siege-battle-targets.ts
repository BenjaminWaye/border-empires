import { OUTPOST_AURA_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { wrapTileX, wrapTileY } from "../client-app-runtime-utils.js";
import { nearestSiegeBatteryTileForBattle, siegeStructureBoostsAttacker } from "../client-fortification-overlays/client-fortification-overlays.js";

// Client-visual only: decides which battles the siege FX may play on. Every
// siege effect (the Siege Battery bombardment, the Siege/Dread Tower beam and
// its kill shot, the opening lance) follows the sim's own attackerOutpostMult
// rule (apps/simulation/src/runtime-combat-support.ts), so none of them plays
// for a battle that no siege structure is actually boosting.

export type SiegeBattleTarget = { readonly x: number; readonly y: number };

const wrappedGap = (a: number, b: number, size: number): number => {
  const gap = Math.abs(a - b) % size;
  return Math.min(gap, size - gap);
};

const withinSiegeRange = (ax: number, ay: number, bx: number, by: number): boolean =>
  Math.max(wrappedGap(ax, bx, WORLD_WIDTH), wrappedGap(ay, by, WORLD_HEIGHT)) <= OUTPOST_AURA_RADIUS;

/** Whether an active siege structure owned by `attackerOwnerId` is in range
 * of the battle tile — the gate for the opening lance on a battle or
 * skirmish (popup-marine-overlay-fx.ts). */
export const battleIsSiegeBoosted = (
  state: Pick<ClientState, "tiles">,
  keyFor: (x: number, y: number) => string,
  attackerOwnerId: string,
  targetX: number,
  targetY: number
): boolean =>
  nearestSiegeBatteryTileForBattle({ tiles: state.tiles, keyFor, wrapX: wrapTileX, wrapY: wrapTileY }, targetX, targetY, attackerOwnerId) !== undefined;

/** The battle the Siege/Dread Tower on world tile (towerX, towerY) beams:
 * the most recently started ongoing battle its owner is attacking within
 * siege range. Undefined when the tower isn't active, its tile has changed
 * hands, or its owner has no battle in range — the tower then idles instead
 * of beaming some unrelated fight elsewhere on the map. */
export const siegeTowerBattleTargetFor = (
  state: Pick<ClientState, "tiles" | "activeBattles">,
  keyFor: (x: number, y: number) => string,
  towerX: number,
  towerY: number
): SiegeBattleTarget | undefined => {
  const tower = state.tiles.get(keyFor(towerX, towerY));
  const ownerId = tower?.siegeBattery?.ownerId;
  if (!ownerId || !siegeStructureBoostsAttacker(tower, ownerId)) return undefined;
  let latest: { x: number; y: number; startAt: number } | undefined;
  for (const battle of state.activeBattles.values()) {
    if (battle.attackerOwnerId !== ownerId || !withinSiegeRange(towerX, towerY, battle.targetX, battle.targetY)) continue;
    if (!latest || battle.startAt > latest.startAt) latest = { x: battle.targetX, y: battle.targetY, startAt: battle.startAt };
  }
  return latest ? { x: latest.x, y: latest.y } : undefined;
};
