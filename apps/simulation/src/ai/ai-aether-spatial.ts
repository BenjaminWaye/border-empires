import { AEGIS_DOME_PROTECTION_RADIUS, OBSERVATORY_PROTECTION_RADIUS } from "@border-empires/game-domain";
import { isAetherTowerSuppressed, chebyshevWithWrap, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

export const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => chebyshevWithWrap(a.x, a.y, b.x, b.y);
export const keyOf = (tile: { x: number; y: number }): string => `${tile.x},${tile.y}`;
export const at = <T extends AutomationPlannerTile>(tiles: ReadonlyMap<string, T>, x: number, y: number): T | undefined =>
  tiles.get(`${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`);
export const isSea = (tile: AutomationPlannerTile | undefined): boolean => tile?.terrain === "SEA" || tile?.terrain === "COASTAL_SEA";
export const valuable = (tile: AutomationPlannerTile): boolean => Boolean(tile.town || tile.resource || tile.dockId || tile.afc);

/** Known shields only: an unseen shield is handled by normal validation and
 * rejection backoff, never disclosed to the planner as hidden intelligence. */
export function knownShielded(target: Pick<AutomationPlannerTile, "x" | "y" | "ownerId">, visible: readonly AutomationPlannerTile[], now: number, siphon = false): boolean {
  return visible.some(tile => {
    if (tile.ownerId !== target.ownerId) return false;
    const tower = tile.observatory;
    if (tower && tower.ownerId === target.ownerId && tower.status === "active" && !isAetherTowerSuppressed(tower, now) &&
      (siphon || (tower.cooldownUntil ?? 0) <= now) && distance(tile, target) <= OBSERVATORY_PROTECTION_RADIUS) return true;
    const dome = tile.economicStructure;
    return !siphon && dome?.type === "AEGIS_DOME" && dome.ownerId === target.ownerId && dome.status === "active" &&
      distance(tile, target) <= AEGIS_DOME_PROTECTION_RADIUS;
  });
}
