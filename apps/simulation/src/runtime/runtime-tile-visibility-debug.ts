// "Why can this player see this tile?" -- the read-only answer behind the
// sim loopback's /debug/tile-visibility (process-bootstrap.ts) and the
// gateway's /admin/debug/tile-visibility proxy. Built for fog reports where
// a player still sees land they lost: the coverage cache tags every vision
// contribution with a reason ("radius:self", "reach:self",
// "radius:ally:<id>", "relay-beacon", "temporary-reveal", ...), but nothing
// exposed those tags outside the opt-in SIMULATION_VISIBILITY_AUDIT log.
//
// Reads the same classification a fresh login export uses
// (runtime-visibility-classifier.ts), including the non-coverage sources it
// adds on top (combat-lock origins/targets, linked-dock reveals). It does
// NOT reflect: a reconnect served from the per-player snapshot cache (which
// patches deltas in but never drops tiles that left vision), season-end /
// fullVisibility subscribes, or the Astral Dock launch, which only unfilters
// live tile deltas -- reported once as `fullVisionActive`, not per tile.
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { RuntimeVisibilityClassification } from "../runtime-visibility-classifier.js";

/** Largest square half-width one request may scan ((2r+1)² tiles). */
export const TILE_VISIBILITY_DEBUG_MAX_RADIUS = 8;

export type TileVisibilityDebugQuery = {
  readonly playerId: string;
  readonly x: number;
  readonly y: number;
  /** Half-width of the square around (x, y) to report; 0 = just that tile. */
  readonly radius: number;
};

export type TileVisibilityDebugTile = {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  /** Every source making the tile visible; empty when it isn't. */
  readonly reasons: readonly string[];
  readonly ownerId?: string;
  readonly ownershipState?: string;
  readonly reachOwnerId?: string;
};

export type TileVisibilityDebugReport = {
  readonly playerId: string;
  readonly playerKnown: boolean;
  readonly allies: readonly string[];
  readonly fullVisionActive: boolean;
  readonly tiles: readonly TileVisibilityDebugTile[];
};

export type TileVisibilityDebugDeps = {
  readonly allies: (playerId: string) => readonly string[] | undefined;
  readonly classify: (playerId: string, tileKeys: readonly string[]) => RuntimeVisibilityClassification;
  readonly hasFullVision: (playerId: string) => boolean;
  readonly tileAt: (tileKey: string) => DomainTileState | undefined;
  readonly reachOwnerAt: (x: number, y: number) => string | undefined;
};

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const extraReasons = (classification: RuntimeVisibilityClassification, tileKey: string): string[] => {
  const reasons: string[] = [];
  if (classification.lockOriginKeys.has(tileKey)) reasons.push("lock-origin");
  if (classification.lockTargetOnlyKeys.has(tileKey)) reasons.push("lock-target");
  if (classification.dockRevealKeys.has(tileKey)) reasons.push("dock-reveal");
  return reasons;
};

export const buildTileVisibilityDebugReport = (
  deps: TileVisibilityDebugDeps,
  query: TileVisibilityDebugQuery
): TileVisibilityDebugReport => {
  const radius = Math.max(0, Math.min(TILE_VISIBILITY_DEBUG_MAX_RADIUS, Math.floor(query.radius)));
  const allies = deps.allies(query.playerId);
  const fullVisionActive = deps.hasFullVision(query.playerId);
  const centerX = wrap(query.x, WORLD_WIDTH);
  const centerY = wrap(query.y, WORLD_HEIGHT);
  const points: { x: number; y: number; tileKey: string }[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = wrap(centerX + dx, WORLD_WIDTH);
      const y = wrap(centerY + dy, WORLD_HEIGHT);
      points.push({ x, y, tileKey: simulationTileKey(x, y) });
    }
  }
  const classification = deps.classify(query.playerId, points.map(({ tileKey }) => tileKey));
  const tiles = points.map(({ x, y, tileKey }): TileVisibilityDebugTile => {
    const reasons = [...classification.coverageReasonsForTile(tileKey), ...extraReasons(classification, tileKey)];
    const tile = deps.tileAt(tileKey);
    const reachOwnerId = deps.reachOwnerAt(x, y);
    return {
      x,
      y,
      visible: classification.visibleKeys.has(tileKey),
      reasons,
      ...(tile?.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile?.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(reachOwnerId ? { reachOwnerId } : {})
    };
  });
  return { playerId: query.playerId, playerKnown: allies !== undefined, allies: [...(allies ?? [])].sort(), fullVisionActive, tiles };
};

/** Parses /debug/tile-visibility's query string; undefined when playerId/x/y are missing or not integers. */
export const parseTileVisibilityDebugQuery = (params: URLSearchParams): TileVisibilityDebugQuery | undefined => {
  // Number(null) and Number("") are both 0, so an absent or blank value must be rejected before converting.
  const intParam = (name: string): number | undefined => {
    const raw = params.get(name)?.trim();
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : undefined;
  };
  const playerId = params.get("playerId")?.trim();
  const x = intParam("x");
  const y = intParam("y");
  const radius = params.has("radius") ? intParam("radius") : 0;
  if (!playerId || x === undefined || y === undefined || radius === undefined || radius < 0 || radius > TILE_VISIBILITY_DEBUG_MAX_RADIUS) return undefined;
  return { playerId, x, y, radius };
};

/** This admin-only diagnostic is available to local callers of the metrics listener. */
export const isTileVisibilityDebugLocal = (address: string | undefined): boolean =>
  address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
