// Town refineries on the client (docs/territory-development-plan.md, Phase 2,
// Client). Every client view of a refinery -- its supply line, the moving
// goods, the refined-deposit overlay, the "needs a field" toast and the tile
// menu copy -- reads one status, computed here from the client's own tiles
// with the shared rules (packages/shared/src/refineries/).
//
// The server's derived `refinery` status on the economic-structure JSON only
// refreshes when the refinery tile itself is re-sent, so a link cut or
// restored elsewhere leaves it stale. The owner's client therefore recomputes
// locally: it holds every tile of its own land (the link path), its field
// tiles and its other refineries, so the local evaluation sees every change
// the wire status saw and every later one. The wire status is only used when
// the local evaluation cannot resolve the refinery's town (the town tile has
// not streamed in yet) or for another player's refinery (whose field is
// withheld; they only learn `linked`).
import {
  REFINERY_FIELD_RESOURCE_BY_TYPE, evaluateRefineryAt, isRefineryType, refineryFieldAt, refineryTileKey,
  type RefineryEvaluation, type RefineryFieldResource, type RefineryTile, type RefineryTownResolver, type RefineryType,
  type RefineryUnassignedReason, type RefineryWireStatus
} from "@border-empires/shared";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";
import type { Tile } from "../client-types.js";

/** Client tiles carry the refinery fields under looser types (resource is a string); the shared rules only compare values. */
export const refineryTilesView = (tiles: ReadonlyMap<string, Tile>): ReadonlyMap<string, RefineryTile> =>
  tiles as unknown as ReadonlyMap<string, RefineryTile>;

/** Which of the owner's towns a support tile serves: its wire supportAnchor, else the same lowest-tile rule the server uses. */
export const clientRefineryTownResolver = (tiles: ReadonlyMap<string, Tile>): RefineryTownResolver => (ownerId, x, y) => {
  const tile = tiles.get(refineryTileKey(x, y));
  if (!tile) return undefined;
  const anchor = tile.economicStructure?.ownerId === ownerId ? tile.economicStructure.supportAnchor : undefined;
  const town = anchor ? tiles.get(refineryTileKey(anchor.x, anchor.y)) : assignedTownForSupportTile(tiles, tile, ownerId);
  if (!town?.town || town.ownerId !== ownerId || town.ownershipState !== "SETTLED" || town.town.populationTier === "SETTLEMENT") return undefined;
  return refineryTileKey(town.x, town.y);
};

/** Why a refinery shows the "needs a field" toast: the shared unassigned reasons, or a broken link. */
export type RefineryNeedsField = RefineryUnassignedReason | "UNLINKED";

export type RefineryClientStatus = {
  key: string;
  x: number;
  y: number;
  type: RefineryType;
  resource: RefineryFieldResource;
  ownerId: string;
  townKey?: string;
  /** Every tile of the held field, ascending; absent while unassigned or for another player's refinery. */
  fieldTiles?: ReadonlyArray<{ x: number; y: number }>;
  fieldId?: string;
  anchor?: { x: number; y: number };
  linked: boolean;
  /** Linked and active: the line carries goods and the field shows the refined overlay. */
  working: boolean;
  boosted: boolean;
  processedTileKeys: readonly string[];
  /** Set for the owner's active refinery that processes nothing because it has no usable field or link. */
  needsField?: RefineryNeedsField;
  source: "local" | "wire";
};

const needsFieldFor = (status: string, reason: RefineryUnassignedReason | undefined, linked: boolean): RefineryNeedsField | undefined =>
  status !== "active" ? undefined : reason ?? (linked ? undefined : "UNLINKED");

const fromLocal = (evaluation: RefineryEvaluation, status: string): RefineryClientStatus => {
  const needsField = needsFieldFor(status, evaluation.unassignedReason, evaluation.linked);
  return {
    key: evaluation.key, x: evaluation.x, y: evaluation.y, type: evaluation.type, resource: evaluation.resource, ownerId: evaluation.ownerId,
    ...(evaluation.townKey ? { townKey: evaluation.townKey } : {}),
    ...(evaluation.field ? { fieldTiles: evaluation.field.tiles.map(({ x, y }) => ({ x, y })), fieldId: evaluation.field.id } : {}),
    ...(evaluation.anchor ? { anchor: evaluation.anchor } : {}),
    linked: evaluation.linked, working: evaluation.working, boosted: evaluation.boosted,
    processedTileKeys: evaluation.processedTileKeys, ...(needsField ? { needsField } : {}), source: "local"
  };
};

const fromWire = (tiles: ReadonlyMap<string, Tile>, tile: Tile, type: RefineryType, wire: RefineryWireStatus | undefined, isOwner: boolean): RefineryClientStatus => {
  const record = tile.economicStructure!;
  const resource = REFINERY_FIELD_RESOURCE_BY_TYPE[type];
  const base: RefineryClientStatus = {
    key: refineryTileKey(tile.x, tile.y), x: tile.x, y: tile.y, type, resource, ownerId: record.ownerId,
    linked: false, working: false, boosted: false, processedTileKeys: [], source: "wire"
  };
  if (!wire) return base;
  if ("unassigned" in wire) {
    const needsField = isOwner ? needsFieldFor(record.status, "NO_FIELD", false) : undefined;
    return { ...base, ...(needsField ? { needsField } : {}) };
  }
  const linked = wire.linked;
  const working = linked && record.status === "active";
  if (!("fieldX" in wire)) return { ...base, linked, working };
  const field = refineryFieldAt(refineryTilesView(tiles), wire.fieldX, wire.fieldY, resource);
  const processedTileKeys = working && field
    ? field.tiles.filter((fieldTile) => fieldTile.ownerId === record.ownerId && fieldTile.ownershipState === "SETTLED").map(({ x, y }) => refineryTileKey(x, y))
    : [];
  const needsField = isOwner ? needsFieldFor(record.status, undefined, linked) : undefined;
  return {
    ...base, linked, working, processedTileKeys, anchor: { x: wire.fieldX, y: wire.fieldY },
    ...(field ? { fieldTiles: field.tiles.map(({ x, y }) => ({ x, y })), fieldId: field.id } : {}),
    ...(needsField ? { needsField } : {})
  };
};

/** The refinery on `tile` as the viewer `me` should see it; undefined when the tile has no refinery. */
export const refineryClientStatus = (tiles: ReadonlyMap<string, Tile>, tile: Tile | undefined, me: string): RefineryClientStatus | undefined => {
  const record = tile?.economicStructure;
  if (!tile || !record || !isRefineryType(record.type)) return undefined;
  const isOwner = record.ownerId === me;
  if (isOwner) {
    const local = evaluateRefineryAt(refineryTilesView(tiles), tile as unknown as RefineryTile, clientRefineryTownResolver(tiles));
    const wire = record.refinery;
    // A resolved town means the local evaluation saw the whole link: it is at least as new as the wire.
    if (local && (local.townKey || !wire || local.unassignedReason)) return fromLocal(local, record.status);
  }
  return fromWire(tiles, tile, record.type, record.refinery, isOwner);
};

// One entry per refinery asked about since the last tile change; the visible
// window holds a few dozen at most, and the cap keeps a wide pan bounded.
const MAX_CACHED_STATUSES = 1024;
let cachedTiles: ReadonlyMap<string, Tile> | undefined;
let cachedRevision = -1;
let cachedMe = "";
const cachedStatuses = new Map<string, RefineryClientStatus | undefined>();

/** refineryClientStatus, remembered until the tile map, its revision or the viewer changes. */
export const refineryStatusFor = (
  view: { readonly tiles: ReadonlyMap<string, Tile>; readonly tilesRevision: number; readonly me: string }, tile: Tile | undefined
): RefineryClientStatus | undefined => {
  if (!tile || !isRefineryType(tile.economicStructure?.type)) return undefined;
  if (cachedTiles !== view.tiles || cachedRevision !== view.tilesRevision || cachedMe !== view.me || cachedStatuses.size >= MAX_CACHED_STATUSES) {
    cachedTiles = view.tiles; cachedRevision = view.tilesRevision; cachedMe = view.me;
    cachedStatuses.clear();
  }
  const key = refineryTileKey(tile.x, tile.y);
  if (cachedStatuses.has(key)) return cachedStatuses.get(key);
  const status = refineryClientStatus(view.tiles, tile, view.me);
  cachedStatuses.set(key, status);
  return status;
};
