import { AETHER_BRIDGE_MAX_SEA_TILES, playerHasAbilityTech } from "@border-empires/game-domain";
import { at, distance, isSea, keyOf, knownShielded, valuable } from "./ai-aether-spatial.js";
import type { AutomationPlannerInput, AutomationPlannerTile } from "./automation-command-planner-types.js";
import type { AiAetherAction } from "./ai-aether-planner.js";

const directions = [
  { dx: 0, dy: -1, name: "N" }, { dx: 1, dy: 0, name: "E" },
  { dx: 0, dy: 1, name: "S" }, { dx: -1, dy: 0, name: "W" }
] as const;

/** Route planning reads ONLY the player's visible tactical slice. Unknown
 * sea/land is never guessed into a valid crossing. */
export function chooseAetherRoute<T extends AutomationPlannerTile>(
  input: AutomationPlannerInput<T>, visible: ReadonlyMap<string, T>, ready: readonly T[]
): AiAetherAction | undefined {
  const techs = input.techIds ?? [];
  const owned = [...visible.values()].filter(tile => tile.ownerId === input.playerId && tile.terrain === "LAND");
  const inRange = (tile: T): boolean => ready.some(tower => distance(tower, tile) <= (input.tacticalView?.castRange ?? 0));
  if (playerHasAbilityTech(techs, "remove_mountain")) {
    for (const origin of owned) for (const dir of directions) {
      const barrier = at(visible, origin.x + dir.dx, origin.y + dir.dy);
      const prize = at(visible, origin.x + dir.dx * 2, origin.y + dir.dy * 2);
      if (!barrier || barrier.terrain !== "MOUNTAIN" || barrier.ownerId || !prize || prize.terrain !== "LAND" || prize.ownerId || !valuable(prize) || !inRange(barrier)) continue;
      return { type: "REMOVE_MOUNTAIN", payload: { x: barrier.x, y: barrier.y }, value: 95 };
    }
  }
  if (playerHasAbilityTech(techs, "aether_bridge")) {
    // Runtime crossings are straight, non-wrapped sea segments. Enumerating
    // at most four cardinal rays per focused coastal garrison keeps work
    // linear in the bounded visible scope, not origins × all landing tiles.
    for (const origin of owned) {
      if (origin.ownershipState !== "SETTLED") continue;
      for (const dir of directions) {
        for (let step = 1; step <= AETHER_BRIDGE_MAX_SEA_TILES + 1; step++) {
          const x = origin.x + dir.dx * step, y = origin.y + dir.dy * step;
          const tile = visible.get(`${x},${y}`);
          if (!tile) break;
          if (isSea(tile)) continue;
          if (step > 1 && tile.terrain === "LAND" && !tile.ownerId && valuable(tile) && inRange(tile) && !input.tacticalView?.bridgeLandingKeys?.includes(keyOf(tile))) {
            return { type: "CAST_AETHER_BRIDGE", payload: { x: tile.x, y: tile.y }, value: 110 };
          }
          break;
        }
      }
    }
  }
  if (playerHasAbilityTech(techs, "create_mountain") && input.manpower < 60) {
    const shields = [...visible.values()].filter(tile => tile.observatory || tile.economicStructure?.type === "AEGIS_DOME");
    for (const origin of owned) {
      if (!(origin.town || origin.afc)) continue;
      for (const dir of directions) {
        const threat = at(visible, origin.x + dir.dx, origin.y + dir.dy);
        // Emergency terrain defense only against an exposed hostile muster.
        // Never destroy an economic site or seal an unowned expansion route.
        if (!threat?.ownerId || threat.ownerId === input.playerId || input.nonHostilePlayerIds?.has(threat.ownerId) ||
          threat.terrain !== "LAND" || (threat.muster?.amount ?? 0) < 60 || valuable(threat) || threat.naturalWonder ||
          threat.fort || threat.observatory || threat.siegeBattery || threat.economicStructure || !inRange(threat) ||
          knownShielded(threat, shields, input.issuedAt)) continue;
        return { type: "CREATE_MOUNTAIN", payload: { x: threat.x, y: threat.y }, value: 180 };
      }
    }
  }
  if (playerHasAbilityTech(techs, "aether_wall") && input.manpower < 60) {
    for (const origin of owned) {
      if (origin.ownershipState !== "SETTLED" || !(origin.town || origin.afc) || !inRange(origin)) continue;
      for (const dir of directions) {
        const threat = at(visible, origin.x + dir.dx, origin.y + dir.dy);
        if (!threat?.ownerId || threat.ownerId === input.playerId || input.nonHostilePlayerIds?.has(threat.ownerId) || threat.terrain !== "LAND" || (threat.muster?.amount ?? 0) < 60) continue;
        if (input.tacticalView?.wallEdges?.includes(`${keyOf(origin)}:${dir.name}`)) continue;
        return { type: "CAST_AETHER_WALL", payload: { x: origin.x, y: origin.y, direction: dir.name, length: 1 }, value: 170 };
      }
    }
  }
  return undefined;
}
