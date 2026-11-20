// Places the tracker's "Next step" rows can point at when manpower or coin runs short (owner feedback
// 2026-11-18: with low MP the tracker only said "Saving MP", while the real options are a salvage shipment,
// a waystation, a neutral town, or a Manufactory for more coin; 2026-11-20: with none of those in sight,
// point at the nearest unexplored ground). Guidance only: every row focuses a tile whose own tile menu
// does the action, and the server checks it again.
import {
  TECH_REQUIREMENTS_BY_STRUCTURE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  manpowerPerBatch,
  manpowerRegenWeightForSettlementIndex,
  terrainAdjustedTownManpower,
  wrapX,
  wrapY
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { salvageTributeStatus } from "../client-salvage-tribute/client-salvage-tribute.js";
import { hasFreeResourceSlots } from "../client-tile-action-logic/client-resource-slot-gate.js";
import { townTileOpenPlotReason } from "../client-tile-action-logic/client-town-tile-support-gate.js";
import { townIdentityForTile } from "../client-town-identity.js";
import { townTerrainForTile } from "../client-town-terrain-modifiers/client-town-tile-terrain.js";

export type NextStepSite = { x: number; y: number; name?: string };

export type NextStepSources = {
  /** Your garrisoned, active Reclamation Works that can ship a load now. */
  salvage?: NextStepSite & { delivered: number; loads: number };
  /** An unactivated, visible waystation; `owned` when it only needs Activate. */
  waystation?: NextStepSite & { owned: boolean };
  /**
   * The nearest visible unowned town, with what holding it adds: max manpower, and manpower per 4h batch
   * after the diminishing weight for your own garrisoned town count (as the town-capture card shows it).
   */
  neutralTown?: NextStepSite & { capAdded: number; perBatch: number };
  /**
   * A garrisoned town of yours (not a SETTLEMENT) with an open build plot, when the town menu's Manufactory
   * action would be enabled: its Manifest researched and a free resource slot (client-tile-action-logic.ts).
   * Manufactories stack, so a town that already has one still counts.
   */
  manufactoryTown?: NextStepSite;
  /** The nearest unexplored tile (absent from the client's map) beside known ground: tap it to Explore. */
  explore?: NextStepSite;
};

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

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
  let explore: NextStepSite | undefined;
  let ownedTowns = 0;
  const manufactoryTech = TECH_REQUIREMENTS_BY_STRUCTURE.MANUFACTORY;
  const manufactoryUnlocked = Boolean(manufactoryTech && state.techIds.includes(manufactoryTech)) && hasFreeResourceSlots(state, "MANUFACTORY");
  for (const tile of state.tiles.values()) {
    // Unexplored ground is absent from the map (fogged tiles were seen before); check beside every known tile.
    for (const [dx, dy] of NEIGHBOURS) {
      const x = wrapX(tile.x + dx, WORLD_WIDTH);
      const y = wrapY(tile.y + dy, WORLD_HEIGHT);
      if (!state.tiles.has(`${x},${y}`)) explore = nearer(explore, { x, y });
    }
    if (tile.fogged) continue;
    if (tile.waystation && !tile.waystation.activated) {
      if (tile.ownerId === me) ownedWaystation = nearer(ownedWaystation, tile);
      else if (!tile.ownerId) openWaystation = nearer(openWaystation, tile);
    }
    const town = townIdentityForTile(tile);
    if (town && !tile.ownerId) neutralTown = nearer(neutralTown, tile);
    if (tile.ownerId !== me) continue;
    if (tile.town && tile.ownershipState === "SETTLED") ownedTowns += 1;
    const status = salvageTributeStatus(state, tile);
    if (status && !status.reason) salvage = nearer(salvage, { x: tile.x, y: tile.y, delivered: status.delivered, loads: status.loads });
    if (manufactoryUnlocked && town && town.populationTier !== "SETTLEMENT" && tile.ownershipState === "SETTLED" &&
        !townTileOpenPlotReason(state, tile)) manufactoryTown = nearer(manufactoryTown, tile);
  }
  const waystation = ownedWaystation ?? openWaystation;
  const townValue = (town: Tile): { capAdded: number; perBatch: number } => {
    if (!town.town) return { capAdded: 0, perBatch: 0 };
    const { terrainProfile, coastal } = townTerrainForTile(town, town.town);
    const manpower = terrainAdjustedTownManpower(town.town.populationTier, terrainProfile, coastal);
    return {
      capAdded: Math.round(manpower.cap),
      perBatch: Math.round(manpowerPerBatch(manpower.regenPerMinute * manpowerRegenWeightForSettlementIndex(ownedTowns)))
    };
  };
  return {
    ...(salvage ? { salvage } : {}),
    ...(waystation ? { waystation: { x: waystation.x, y: waystation.y, owned: waystation === ownedWaystation } } : {}),
    ...(neutralTown ? { neutralTown: { ...named(neutralTown), ...townValue(neutralTown) } } : {}),
    ...(manufactoryTown ? { manufactoryTown: named(manufactoryTown) } : {}),
    ...(explore ? { explore } : {})
  };
};
