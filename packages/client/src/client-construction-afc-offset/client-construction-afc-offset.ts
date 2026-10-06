import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import {
  constructionSiteForTile,
  type AfcOffset,
  type ConstructionSite
} from "../client-construction-phase/client-construction-phase.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Where a construction site's fabricated parts come from. Every structure is
// fabricated at its owner's AFC and carried to the site (docs/construction-animation-plan.md);
// nothing is built in orbit, so a site whose owner's AFC is not known gets no delivery pod
// rather than a stand-in drop.

// One pass over the loaded tiles records every owner's home AFC (the same earliest-activation
// rule as findHomeAfcTileForOwner). Scanning every loaded tile is expensive, and a rebuild can
// have sites from many owners, so the scan happens once per terrain rebuild (`rebuildKey` is
// that rebuild's own timestamp) rather than once per owner or per site.
type AfcPosition = { readonly x: number; readonly y: number };
let cachedKey: number | undefined;
let cachedTiles: ReadonlyMap<string, Tile> | undefined;
let cachedAfcByOwner = new Map<string, AfcPosition>();

const homeAfcsByOwner = (tiles: ReadonlyMap<string, Tile>): Map<string, AfcPosition> => {
  const best = new Map<string, { x: number; y: number; key: string; activatedAt: number }>();
  for (const [key, tile] of tiles) {
    const afc = tile.afc;
    if (!afc || tile.ownerId !== afc.ownerId) continue;
    const activatedAt = afc.activatedAt ?? 0;
    const current = best.get(afc.ownerId);
    if (!current || activatedAt < current.activatedAt || (activatedAt === current.activatedAt && key < current.key)) {
      best.set(afc.ownerId, { x: tile.x, y: tile.y, key, activatedAt });
    }
  }
  return new Map([...best].map(([ownerId, { x, y }]) => [ownerId, { x, y }]));
};

export const afcOffsetForSite = (
  state: Pick<ClientState, "tiles">,
  site: { x: number; y: number; ownerId: string },
  rebuildKey: number
): AfcOffset | undefined => {
  if (cachedKey !== rebuildKey || cachedTiles !== state.tiles) {
    cachedKey = rebuildKey;
    cachedTiles = state.tiles;
    cachedAfcByOwner = homeAfcsByOwner(state.tiles);
  }
  const afc = cachedAfcByOwner.get(site.ownerId);
  if (!afc) return undefined;
  return { dx: toroidDelta(site.x, afc.x, WORLD_WIDTH), dy: toroidDelta(site.y, afc.y, WORLD_HEIGHT) };
};

// The 3D renderers' entry point: the site for `tile`'s `field` record, with the owner's AFC offset.
export const constructionSiteForRebuild = (
  state: Pick<ClientState, "tiles">,
  tile: Tile,
  field: ConstructionSite["field"],
  rebuildKey: number
): ConstructionSite | undefined => {
  const site = constructionSiteForTile(tile, Date.now(), field);
  return site ? { ...site, afcOffset: afcOffsetForSite(state, site, rebuildKey) } : undefined;
};
