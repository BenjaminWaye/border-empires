import { afcBuildCost } from "@border-empires/shared";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileActionDef } from "./client-types.js";

type Availability = (enabled: boolean, reason: string, detail?: string) => Pick<TileActionDef, "disabled" | "disabledReason" | "detail">;

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
