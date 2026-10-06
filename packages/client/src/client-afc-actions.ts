import { AFC_MODULE_CALL_DOWN_MS, AFC_MODULE_SLOTS, afcBuildCost } from "@border-empires/shared";
import { afcIsFull } from "./client-afc-slot-notices/client-afc-slot-notices.js";
import { formatCooldownShort } from "./client-app-runtime-utils.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileActionDef } from "./client-types.js";

type Availability = (enabled: boolean, reason: string, detail?: string) => Pick<TileActionDef, "disabled" | "disabledReason" | "detail">;

/** One "Call down" row per researched module not docked here; a module already
 * in transit to this AFC shows as a disabled row with its remaining time. */
export const afcModuleActionsForTile = (state: ClientState, tile: Tile, availability: Availability, nowMs: number = Date.now()): TileActionDef[] => {
  const afc = tile.afc;
  if (afc?.ownerId !== state.me || afc.status !== "active") return [];
  return state.techCatalog.flatMap((tech): TileActionDef[] => {
    if (tech.manifestCategory !== "AFC_MODULE" || !state.techIds.includes(tech.id) || afc.houseModules?.includes(tech.id)) return [];
    const incoming = afc.incomingModules?.find((entry) => entry.techId === tech.id);
    const id = `redeploy_afc_module:${tech.id}` as const;
    if (incoming) return [{ id, label: `${tech.name} incoming`, ...availability(false, `Lands in ${formatCooldownShort(incoming.arrivesAt - nowMs)}`) }];
    if (afcIsFull(afc)) return [{ id, label: `Call down ${tech.name}`, ...availability(false, `AFC full (${AFC_MODULE_SLOTS}/${AFC_MODULE_SLOTS}): build another AFC`) }];
    return [{ id, label: `Call down ${tech.name}`, ...availability(true, "", `Lands here in ${formatCooldownShort(AFC_MODULE_CALL_DOWN_MS)} • leaves its current AFC now`) }];
  });
};

export const buildAfcActionForTile = (state: ClientState, tile: Tile, availability: Availability): TileActionDef | undefined => {
  if (tile.ownerId !== state.me || tile.afc?.status !== "active") return undefined;
  const cost = afcBuildCost([...state.tiles.values()].filter((candidate) => candidate.ownerId === state.me && candidate.afc).length);
  return { id: "build_afc", label: "Build AFC", ...availability(state.gold >= cost, state.gold >= cost ? "" : `Need ${cost} coin`, `${cost} Coin`) };
};

export const isValidAfcLandingTile = (state: ClientState, tile: Tile | undefined): boolean =>
  Boolean(
    tile &&
      tile.terrain === "LAND" &&
      tile.ownerId === state.me &&
      tile.ownershipState === "SETTLED" &&
      !tile.town &&
      !tile.dockId &&
      !tile.afc &&
      !tile.fort &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      !tile.economicStructure
  );
