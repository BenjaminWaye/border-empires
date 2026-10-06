import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { afcPrecedes } from "../client-afc-locate/client-afc-locate.js";
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

// Finding every owner's home AFC means walking every loaded tile, which can be most of the
// world late in a season, and terrain rebuilds run on camera pans too. So the result is kept
// as an index and rescanned only when tiles actually changed (tilesRevision) AND at most once
// per RESCAN_INTERVAL_MS. An AFC appearing therefore shows up within that interval; an AFC
// that is gone or changed is caught at once by re-checking the cached tile, which is O(1).
// Only the pod's launch point depends on this, so a short delay is harmless.
const RESCAN_INTERVAL_MS = 10_000;

type AfcEntry = { readonly key: string; readonly x: number; readonly y: number; readonly activatedAt: number };
type AfcIndex = { byOwner: Map<string, AfcEntry>; revision: number; scannedAtMs: number };
type AfcIndexState = Pick<ClientState, "tiles" | "tilesRevision">;

// Keyed by the tiles map itself, so separate client states (tests, Storybook renderers) never
// share an index, and a dropped map takes its index with it.
const indexes = new WeakMap<ReadonlyMap<string, Tile>, AfcIndex>();

const scan = (tiles: ReadonlyMap<string, Tile>): Map<string, AfcEntry> => {
  const byOwner = new Map<string, AfcEntry>();
  for (const [key, tile] of tiles) {
    const afc = tile.afc;
    if (!afc || tile.ownerId !== afc.ownerId) continue;
    const candidate = { key, x: tile.x, y: tile.y, activatedAt: afc.activatedAt ?? 0 };
    const current = byOwner.get(afc.ownerId);
    if (!current || afcPrecedes(candidate, current)) byOwner.set(afc.ownerId, candidate);
  }
  return byOwner;
};

const stillHome = (tiles: ReadonlyMap<string, Tile>, ownerId: string, entry: AfcEntry): boolean => {
  const tile = tiles.get(entry.key);
  return Boolean(tile?.afc && tile.afc.ownerId === ownerId && tile.ownerId === ownerId && (tile.afc.activatedAt ?? 0) === entry.activatedAt);
};

const rescan = (state: AfcIndexState, nowMs: number): AfcIndex => {
  const index = { byOwner: scan(state.tiles), revision: state.tilesRevision, scannedAtMs: nowMs };
  indexes.set(state.tiles, index);
  return index;
};

// `nowMs` is any monotonic clock (the 3D rebuild passes its performance.now()).
export const afcOffsetForSite = (
  state: AfcIndexState,
  site: { x: number; y: number; ownerId: string },
  nowMs: number
): AfcOffset | undefined => {
  let index = indexes.get(state.tiles);
  if (!index || (index.revision !== state.tilesRevision && nowMs - index.scannedAtMs >= RESCAN_INTERVAL_MS)) index = rescan(state, nowMs);
  let afc = index.byOwner.get(site.ownerId);
  if (afc && !stillHome(state.tiles, site.ownerId, afc)) afc = rescan(state, nowMs).byOwner.get(site.ownerId);
  if (!afc) return undefined;
  return { dx: toroidDelta(site.x, afc.x, WORLD_WIDTH), dy: toroidDelta(site.y, afc.y, WORLD_HEIGHT) };
};

// The 3D renderers' entry point: the site for `tile`'s `field` record, with the owner's AFC offset.
export const constructionSiteForRebuild = (
  state: AfcIndexState,
  tile: Tile,
  field: ConstructionSite["field"],
  nowMs: number
): ConstructionSite | undefined => {
  const site = constructionSiteForTile(tile, Date.now(), field);
  return site ? { ...site, afcOffset: afcOffsetForSite(state, site, nowMs) } : undefined;
};
