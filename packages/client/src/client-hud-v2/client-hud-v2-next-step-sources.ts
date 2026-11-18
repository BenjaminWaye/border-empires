// Places the tracker's "Next step" rows can point at when manpower or coin runs short (owner feedback
// 2026-11-18: with low MP the tracker only said "Saving MP", while the real options are a salvage shipment,
// a waystation, a neutral town, or a Manufactory for more coin). Guidance only: every row focuses a tile
// whose own tile menu does the action, and the server checks it again.
import { TECH_REQUIREMENTS_BY_STRUCTURE } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { salvageTributeStatus } from "../client-salvage-tribute/client-salvage-tribute.js";
import { hasFreeResourceSlots } from "../client-tile-action-logic/client-resource-slot-gate.js";
import { townTileOpenPlotReason } from "../client-tile-action-logic/client-town-tile-support-gate.js";
import { townIdentityForTile } from "../client-town-identity.js";

export type NextStepSite = { x: number; y: number; name?: string };

export type NextStepSources = {
  /** Your garrisoned, active Reclamation Works that can ship a load now. */
  salvage?: NextStepSite & { delivered: number; loads: number };
  /** An unactivated, visible waystation; `owned` when it only needs Activate. */
  waystation?: NextStepSite & { owned: boolean };
  /** The nearest visible unowned town. */
  neutralTown?: NextStepSite;
  /**
   * A garrisoned town of yours (not a SETTLEMENT) with an open build plot, when the town menu's Manufactory
   * action would be enabled: its Manifest researched and a free resource slot (client-tile-action-logic.ts).
   * Manufactories stack, so a town that already has one still counts.
   */
  manufactoryTown?: NextStepSite;
};

const named = (tile: Tile): NextStepSite => {
  const name = townIdentityForTile(tile)?.name;
  return name ? { x: tile.x, y: tile.y, name } : { x: tile.x, y: tile.y };
};

/** One pass over the known tiles; the nearest candidate to home wins where there is a choice. */
export const scanNextStepSources = (state: ClientState): NextStepSources => {
  const me = state.me;
  if (!me) return {};
  const home = state.homeTile;
  const distance = (t: { x: number; y: number }): number => (home ? Math.abs(t.x - home.x) + Math.abs(t.y - home.y) : 0);
  const nearer = <T extends { x: number; y: number }>(best: T | undefined, next: T): T => (!best || distance(next) < distance(best) ? next : best);
  let salvage: NextStepSources["salvage"];
  let ownedWaystation: Tile | undefined;
  let openWaystation: Tile | undefined;
  let neutralTown: Tile | undefined;
  let manufactoryTown: Tile | undefined;
  const manufactoryTech = TECH_REQUIREMENTS_BY_STRUCTURE.MANUFACTORY;
  const manufactoryUnlocked = Boolean(manufactoryTech && state.techIds.includes(manufactoryTech)) && hasFreeResourceSlots(state, "MANUFACTORY");
  for (const tile of state.tiles.values()) {
    if (tile.fogged) continue;
    if (tile.waystation && !tile.waystation.activated) {
      if (tile.ownerId === me) ownedWaystation = nearer(ownedWaystation, tile);
      else if (!tile.ownerId) openWaystation = nearer(openWaystation, tile);
    }
    const town = townIdentityForTile(tile);
    if (town && !tile.ownerId) neutralTown = nearer(neutralTown, tile);
    if (tile.ownerId !== me) continue;
    const status = salvageTributeStatus(state, tile);
    if (status && !status.reason) salvage = nearer(salvage, { x: tile.x, y: tile.y, delivered: status.delivered, loads: status.loads });
    if (manufactoryUnlocked && town && town.populationTier !== "SETTLEMENT" && tile.ownershipState === "SETTLED" &&
        !townTileOpenPlotReason(state, tile)) manufactoryTown = nearer(manufactoryTown, tile);
  }
  const waystation = ownedWaystation ?? openWaystation;
  return {
    ...(salvage ? { salvage } : {}),
    ...(waystation ? { waystation: { x: waystation.x, y: waystation.y, owned: waystation === ownedWaystation } } : {}),
    ...(neutralTown ? { neutralTown: named(neutralTown) } : {}),
    ...(manufactoryTown ? { manufactoryTown: named(manufactoryTown) } : {})
  };
};
