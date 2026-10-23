// Where each map name goes, kept separate from how it looks (opacity and ink
// come per frame from client-map-name-labels.ts). Every name is fitted inside
// the tiles it belongs on, never overflowing them (client-name-path-fit.ts):
//   - player names: along the core of each run of the player's explored
//     garrisons (client-territory-name-layout.ts);
//   - island names: along the core of the island's explored garrisons -- the
//     namer's own for a chosen name, anyone's for a generated one -- found by
//     flooding out from the island's label line (client-region-name-layout.ts).
// Placement walks tiles, so it is cached: recomputed when island names change,
// and at most every PLACEMENT_MIN_INTERVAL_MS while tiles keep changing.
import type { IslandLabel } from "@border-empires/shared";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import { isPlanetaryDefenseOwnerId } from "../client-planetary-defense-style.js";
import type { ClientState } from "../client-state/client-state.js";
import type { NameLabelPath } from "./client-map-name-label-draw.js";
import { fitNamePathToTiles } from "./client-name-path-fit.js";
import { layoutNameInRegion } from "./client-region-name-layout.js";
import { computeTerritoryNameLabels } from "./client-territory-name-layout.js";

const PLACEMENT_MIN_INTERVAL_MS = 1_500;
/** Longest stretch an island name is spread over: a continent's name stays readable instead of scattering letters across the world. */
const ISLAND_LABEL_MAX_HALF_SPAN_TILES = 18;

/** The island's own label line, from the simulation's ISLAND_NAMES geometry. */
export const islandLabelPath = (label: IslandLabel): NameLabelPath => {
  const half = Math.min(ISLAND_LABEL_MAX_HALF_SPAN_TILES, Math.max(0.5, label.span * 0.42));
  const ux = Math.cos(label.angle);
  const uy = Math.sin(label.angle);
  return {
    text: label.name,
    points: [{ x: label.x - half * ux, y: label.y - half * uy }, { x: label.x + half * ux, y: label.y + half * uy }],
    heightTiles: Math.min(5, Math.max(1, label.thickness * 0.3)),
    spanTiles: 2 * half + 2
  };
};

export type NamePlacementDeps = {
  readonly state: Pick<ClientState, "tiles" | "tilesRevision" | "islandLabels" | "me" | "meName" | "playerNames" | "leaderboard">;
  readonly isExploredAt: (x: number, y: number) => boolean;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
};

export type NamePlacements = {
  /** Bumps whenever a recompute produced the lists below. */
  readonly version: number;
  readonly players: ReadonlyArray<{ readonly ownerId: string; readonly path: NameLabelPath }>;
  readonly islands: ReadonlyArray<{ readonly label: IslandLabel; readonly path: NameLabelPath }>;
};

const SEED_SAMPLES = 40;

export const computeNamePlacements = (deps: NamePlacementDeps, version: number): NamePlacements => {
  const exploredAt = (x: number, y: number): boolean => deps.isExploredAt(deps.wrapX(x), deps.wrapY(y));
  // One tile in from unexplored ground: the storm clouds spill over the outermost explored ring.
  const isExplored = (x: number, y: number): boolean =>
    exploredAt(x, y) && exploredAt(x + 1, y) && exploredAt(x - 1, y) && exploredAt(x, y + 1) && exploredAt(x, y - 1);
  const tileAt = (x: number, y: number) => deps.state.tiles.get(`${deps.wrapX(x)},${deps.wrapY(y)}`);

  const players: Array<{ ownerId: string; path: NameLabelPath }> = [];
  for (const label of computeTerritoryNameLabels(deps.state.tiles.values(), { skipOwner: (ownerId) => isPlanetaryDefenseOwnerId(ownerId) })) {
    const name = playerDisplayNameForOwnerFromState(deps.state, label.ownerId);
    if (!name) continue;
    // The player's own explored garrisons: never over a rival, frontier or unexplored tile.
    const onOwnGarrison = (x: number, y: number): boolean => {
      if (!isExplored(x, y)) return false;
      const tile = tileAt(x, y);
      return tile?.ownerId === label.ownerId && tile.ownershipState === "SETTLED";
    };
    const path = fitNamePathToTiles({ text: name, points: label.points, heightTiles: label.heightTiles, spanTiles: label.spanTiles }, onOwnGarrison);
    if (path) players.push({ ownerId: label.ownerId, path });
  }

  const islands: Array<{ label: IslandLabel; path: NameLabelPath }> = [];
  for (const label of deps.state.islandLabels ?? []) {
    const onIslandGarrison = (x: number, y: number): boolean => {
      if (!isExplored(x, y)) return false;
      const tile = tileAt(x, y);
      if (tile?.terrain !== "LAND" || tile.ownershipState !== "SETTLED" || !tile.ownerId) return false;
      return label.namerId ? tile.ownerId === label.namerId : !isPlanetaryDefenseOwnerId(tile.ownerId);
    };
    const line = islandLabelPath(label);
    const [a, b] = [line.points[0]!, line.points[1]!];
    const seeds = Array.from({ length: SEED_SAMPLES + 1 }, (_, step) => ({ x: a.x + ((b.x - a.x) * step) / SEED_SAMPLES, y: a.y + ((b.y - a.y) * step) / SEED_SAMPLES }));
    const region = layoutNameInRegion(seeds, onIslandGarrison);
    if (!region) continue;
    const path = fitNamePathToTiles({ text: label.name, ...region, heightTiles: Math.min(region.heightTiles, line.heightTiles) }, onIslandGarrison);
    if (path) islands.push({ label, path });
  }
  return { version, players, islands };
};

const pathKey = (path: NameLabelPath): string =>
  `${path.text}|${path.heightTiles.toFixed(2)}|${path.spanTiles.toFixed(2)}|${path.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}`;

/** Identity of what the placements would draw (ink style aside). */
export const placementsContentKey = (placements: NamePlacements): string =>
  [...placements.players.map(({ path }) => `p:${pathKey(path)}`), ...placements.islands.map(({ label, path }) => `i:${label.status}:${pathKey(path)}`)].join(";");

export const createNamePlacementCache = (deps: NamePlacementDeps): { readonly current: (nowMs: number) => NamePlacements } => {
  let cached: { placements: NamePlacements; contentKey: string; revision: number; islandLabels: unknown; meName: string; computedAt: number } | undefined;
  let version = 0;
  return {
    current: (nowMs) => {
      const { tilesRevision, islandLabels, meName } = deps.state;
      const stale =
        !cached ||
        cached.islandLabels !== islandLabels ||
        cached.meName !== meName ||
        (cached.revision !== tilesRevision && nowMs - cached.computedAt >= PLACEMENT_MIN_INTERVAL_MS);
      if (stale) {
        const next = computeNamePlacements(deps, version + 1);
        const contentKey = placementsContentKey(next);
        // Same names in the same places: keep the old version so nothing downstream redraws.
        const unchanged = cached?.contentKey === contentKey;
        if (!unchanged) version += 1;
        cached = { placements: unchanged ? cached!.placements : next, contentKey, revision: tilesRevision, islandLabels, meName, computedAt: nowMs };
      }
      return cached!.placements;
    }
  };
};
