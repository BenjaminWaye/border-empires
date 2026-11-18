import type { Tile } from "../client-types.js";
import {
  exposedSidesForTile,
  isOwnedSettledLandTile,
  weakDefensibilitySeverity,
  type EdgeDirection,
  type ExposedSidesArgs,
  type WeakDefensibilitySeverity
} from "../client-defensibility-tile.js";

/**
 * The tiles the "Show weak tiles" toggle highlights (2+ open sides, the same
 * exposedSidesForTile / weakDefensibilitySeverity classification the 2D and
 * 3D overlays draw), each with a short player-facing reason, ordered weakest
 * first and then nearest the camera -- so the toggle can pan to the first one
 * and the Integrity panel can list them.
 */
export type WeakDefensibilityEntry = {
  readonly x: number;
  readonly y: number;
  readonly severity: WeakDefensibilitySeverity;
  readonly openSides: readonly EdgeDirection[];
  readonly reason: string;
};

const DELTAS: Record<EdgeDirection, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 }
};

type OpenSideKind = "unclaimed land" | "rival land" | "your ungarrisoned land" | "unexplored land";

const openSideKind = (tile: Tile, side: EdgeDirection, args: ExposedSidesArgs): OpenSideKind => {
  const delta = DELTAS[side];
  const neighbor = args.tiles.get(args.keyFor(args.wrapX(tile.x + delta.dx), args.wrapY(tile.y + delta.dy)));
  if (!neighbor) return "unexplored land";
  if (neighbor.ownerId === args.me) return "your ungarrisoned land";
  if (neighbor.ownerId) return "rival land";
  return "unclaimed land";
};

const joinWords = (words: readonly string[]): string =>
  words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** e.g. "3 open sides: north, east (unclaimed land) and south (rival land)". */
export const weakTileReason = (tile: Tile, openSides: readonly EdgeDirection[], args: ExposedSidesArgs): string => {
  const groups = new Map<OpenSideKind, EdgeDirection[]>();
  for (const side of openSides) {
    const kind = openSideKind(tile, side, args);
    const list = groups.get(kind) ?? [];
    list.push(side);
    groups.set(kind, list);
  }
  const parts = [...groups].map(([kind, sides]) => `${joinWords(sides)} (${kind})`);
  return `${openSides.length} open sides: ${joinWords(parts)}`;
};

const wrappedDistanceSq = (ax: number, ay: number, bx: number, by: number, worldWidth: number, worldHeight: number): number => {
  const rawDx = Math.abs(ax - bx);
  const rawDy = Math.abs(ay - by);
  const dx = worldWidth > 0 ? Math.min(rawDx, worldWidth - rawDx) : rawDx;
  const dy = worldHeight > 0 ? Math.min(rawDy, worldHeight - rawDy) : rawDy;
  return dx * dx + dy * dy;
};

export const weakDefensibilityEntries = (
  args: ExposedSidesArgs & { readonly from?: { x: number; y: number }; readonly worldWidth?: number; readonly worldHeight?: number }
): WeakDefensibilityEntry[] => {
  const ranked: Array<WeakDefensibilityEntry & { distanceSq: number }> = [];
  for (const tile of args.tiles.values()) {
    if (!isOwnedSettledLandTile(tile, args.me)) continue;
    const openSides = exposedSidesForTile(tile, args);
    const severity = weakDefensibilitySeverity(openSides.length);
    if (!severity) continue;
    const distanceSq = args.from ? wrappedDistanceSq(tile.x, tile.y, args.from.x, args.from.y, args.worldWidth ?? 0, args.worldHeight ?? 0) : 0;
    ranked.push({ x: tile.x, y: tile.y, severity, openSides, reason: weakTileReason(tile, openSides, args), distanceSq });
  }
  ranked.sort((a, b) => b.openSides.length - a.openSides.length || a.distanceSq - b.distanceSq || a.y - b.y || a.x - b.x);
  return ranked.map(({ distanceSq: _distanceSq, ...entry }) => entry);
};
