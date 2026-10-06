import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { findHomeAfcTileForOwner } from "../client-afc-locate/client-afc-locate.js";
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

// Shortest signed distance from `from` to `to` on a wrapping axis of `size` tiles.
export const wrappedDelta = (from: number, to: number, size: number): number => {
  let delta = (to - from) % size;
  if (delta > size / 2) delta -= size;
  else if (delta < -size / 2) delta += size;
  return delta;
};

// Scanning every loaded tile for AFCs is far too much to repeat per construction site, and
// every site in one terrain rebuild asks about the same owners, so the lookup is cached
// for the rebuild (`rebuildKey` is that rebuild's own timestamp).
let cachedKey: number | undefined;
let cachedTiles: unknown;
const cachedAfcByOwner = new Map<string, { x: number; y: number } | undefined>();

export const afcOffsetForSite = (
  state: Pick<ClientState, "tiles">,
  site: { x: number; y: number; ownerId: string },
  rebuildKey: number
): AfcOffset | undefined => {
  if (cachedKey !== rebuildKey || cachedTiles !== state.tiles) {
    cachedKey = rebuildKey;
    cachedTiles = state.tiles;
    cachedAfcByOwner.clear();
  }
  if (!cachedAfcByOwner.has(site.ownerId)) {
    const afc = findHomeAfcTileForOwner(state.tiles as ReadonlyMap<string, Tile>, site.ownerId);
    cachedAfcByOwner.set(site.ownerId, afc ? { x: afc.x, y: afc.y } : undefined);
  }
  const afc = cachedAfcByOwner.get(site.ownerId);
  if (!afc) return undefined;
  return { dx: wrappedDelta(site.x, afc.x, WORLD_WIDTH), dy: wrappedDelta(site.y, afc.y, WORLD_HEIGHT) };
};

// The 3D renderers' entry point: the site for `tile`'s `field` record, with the owner's AFC offset.
export const constructionSiteForRebuild = (
  state: Pick<ClientState, "tiles">,
  tile: Tile,
  field: ConstructionSite["field"],
  rebuildKey: number
): ConstructionSite | undefined => {
  const bare = constructionSiteForTile(tile, Date.now(), field);
  if (!bare) return undefined;
  return constructionSiteForTile(tile, Date.now(), field, afcOffsetForSite(state, bare, rebuildKey));
};
