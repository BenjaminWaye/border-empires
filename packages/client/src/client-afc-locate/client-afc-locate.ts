import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

type AfcLocateState = Pick<ClientState, "tiles" | "me" | "camX" | "camY" | "camSubX" | "camSubY" | "selected">;

/** Whether AFC `a` outranks `b` as its owner's home AFC: earliest activatedAt,
 * tile key breaking ties -- the same rule the simulation uses to pick where newly
 * researched modules dock (homeAfcTileKey in afc-module-commissioning.ts). */
export const afcPrecedes = (a: { key: string; activatedAt: number }, b: { key: string; activatedAt: number }): boolean =>
  a.activatedAt < b.activatedAt || (a.activatedAt === b.activatedAt && a.key < b.key);

/** The viewer's home AFC among loaded tiles (see afcPrecedes). */
export const findHomeAfcTile = (state: Pick<ClientState, "tiles" | "me">): Tile | undefined => {
  if (!state.me) return undefined;
  let best: { tile: Tile; key: string; activatedAt: number } | undefined;
  for (const [key, tile] of state.tiles) {
    const afc = tile.afc;
    if (!afc || afc.ownerId !== state.me || tile.ownerId !== state.me) continue;
    const candidate = { tile, key, activatedAt: afc.activatedAt ?? 0 };
    if (!best || afcPrecedes(candidate, best)) best = candidate;
  }
  return best?.tile;
};

/** Jumps the camera to the home AFC, selects it and opens its tile menu on
 * the overview tab (which lists the docked modules). Returns false when no
 * owned AFC is loaded so the caller can fall back to centering on the empire. */
export const locateHomeAfc = (
  state: AfcLocateState,
  openTileMenu: (tile: Tile, clientX: number, clientY: number) => void,
  viewportCenter: { x: number; y: number }
): boolean => {
  const tile = findHomeAfcTile(state);
  if (!tile) return false;
  state.camX = tile.x;
  state.camY = tile.y;
  state.camSubX = 0;
  state.camSubY = 0;
  state.selected = { x: tile.x, y: tile.y };
  openTileMenu(tile, viewportCenter.x, viewportCenter.y);
  return true;
};

/** The owned AFC a module docks on (or is incoming to), else the home AFC --
 * where a freshly researched module is commissioned. */
export const afcTileForModule = (state: Pick<ClientState, "tiles" | "me">, techId: string): Tile | undefined => {
  for (const tile of state.tiles.values()) {
    const afc = tile.afc;
    if (!afc || afc.ownerId !== state.me || tile.ownerId !== state.me) continue;
    if (afc.houseModules?.includes(techId) || afc.incomingModules?.some((entry) => entry.techId === techId)) return tile;
  }
  return findHomeAfcTile(state);
};

/** Points the camera at the AFC a just-researched module lands on so its
 * delivery animation plays on screen. Returns false when no AFC is loaded. */
export const focusAfcForResearchedModule = (state: AfcLocateState, techId: string): boolean => {
  const tile = afcTileForModule(state, techId);
  if (!tile) return false;
  state.camX = tile.x;
  state.camY = tile.y;
  state.camSubX = 0;
  state.camSubY = 0;
  state.selected = { x: tile.x, y: tile.y };
  return true;
};
