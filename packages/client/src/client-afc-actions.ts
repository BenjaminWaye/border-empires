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

export const ownedAfcCount = (state: Pick<ClientState, "tiles" | "me">): number =>
  [...state.tiles.values()].filter((candidate) => candidate.ownerId === state.me && candidate.afc?.ownerId === state.me).length;

/** "Build AFC" sits on an owned AFC and costs Coin -- except after losing the
 * last one, when it is offered free on every owned tile (the server waives the
 * cost when the player owns no AFC). */
export const buildAfcActionForTile = (state: ClientState, tile: Tile, availability: Availability): TileActionDef | undefined => {
  if (tile.ownerId !== state.me) return undefined;
  const owned = ownedAfcCount(state);
  if (owned === 0) return { id: "build_afc", label: "Build AFC", ...availability(true, "", "Free: your last AFC was lost") };
  if (tile.afc?.status !== "active") return undefined;
  const cost = afcBuildCost(owned);
  return { id: "build_afc", label: "Build AFC", ...availability(state.gold >= cost, state.gold >= cost ? "" : `Need ${cost} coin`, `${cost} Coin`) };
};

/** Empty land you own; SETTLED only, except a free rebuild may also use FRONTIER (settled on landing).
 * Per-tile callers (the placement overlays) pass freeRebuild once per session so this never re-scans every tile. */
export const isValidAfcLandingTile = (state: ClientState, tile: Tile | undefined, freeRebuild?: boolean): boolean =>
  Boolean(
    tile &&
      tile.terrain === "LAND" &&
      tile.ownerId === state.me &&
      (tile.ownershipState === "SETTLED" || (tile.ownershipState === "FRONTIER" && (freeRebuild ?? ownedAfcCount(state) === 0))) &&
      !tile.town &&
      !tile.dockId &&
      !tile.afc &&
      !tile.fort &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      !tile.economicStructure
  );
