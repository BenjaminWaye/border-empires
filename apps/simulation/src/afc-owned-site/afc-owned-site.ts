import type { DomainTileState } from "@border-empires/game-domain";

/** A tile with no town, dock, AFC or other structure -- the shared "empty" rule for placing an AFC. */
export const isEmptyAfcSite = (tile: DomainTileState): boolean =>
  !tile.town && !tile.dockId && !tile.afc && !tile.fort && !tile.siegeBattery && !tile.observatory && !tile.economicStructure;
