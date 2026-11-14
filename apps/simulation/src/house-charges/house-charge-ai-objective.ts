// AI pursuit of House Charges (docs/house-charges-plan.md, "Computer-run
// empires"): an AI House whose normal expansion objective selector found
// nothing steers expansion toward its first kept charge that is not complete,
// through the planner view's existing expansionObjective (the frontier
// planner favours steps that close distance to it). O(kept charges) per
// planner view, no tile scans, so it adds nothing to the AI hot path.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { keptHouseCharges } from "@border-empires/shared";

export type HouseChargeExpansionObjective = { x: number; y: number; kind: "neutral_value" | "enemy" };

const BARBARIAN_PLAYER_ID = "barbarian-1";

export const houseChargeExpansionObjective = (
  player: Pick<DomainPlayer, "id" | "houseCharges">,
  tiles: ReadonlyMap<string, DomainTileState>
): HouseChargeExpansionObjective | undefined => {
  const state = player.houseCharges;
  if (!state) return undefined;
  for (const charge of keptHouseCharges(state)) {
    if (state.completeSince?.[charge.id] !== undefined) continue;
    // The first target the House does not already garrison (for a Charter, the town still to take).
    const target = charge.targets.find((candidate) => {
      const tile = tiles.get(`${candidate.x},${candidate.y}`);
      return !(tile?.ownerId === player.id && tile.ownershipState === "SETTLED");
    });
    if (!target) continue;
    const ownerId = tiles.get(`${target.x},${target.y}`)?.ownerId;
    const enemy = ownerId !== undefined && ownerId !== player.id && ownerId !== BARBARIAN_PLAYER_ID;
    return { x: target.x, y: target.y, kind: enemy ? "enemy" : "neutral_value" };
  }
  return undefined;
};
