// Where a scout report's find links point: the report card's chips (client-scout-drone-hud.ts) and the
// Chronicle's find links (client-hud-v2-chronicle-scout-chips.ts). The server keeps a find's tiles in the
// order the drone first saw them, so an empire's first tile is the edge of its land nearest the player's,
// often a tile pressed into their own border, and a find taken since sits on their own land: "Empire
// pinned my own land twice, and Town pinned Celelenwatch, which I already own" (Playtest Run 5,
// d3-1540-explorer). A link now skips tiles the player or an ally holds and leads with the tiles that
// touch none of theirs, so it lands on the place reported.
import { WORLD_HEIGHT, WORLD_WIDTH, type ScoutFind, type ScoutFindingSites } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { scoutFindPlaces, scoutSitesFor, type ScoutFindsState } from "./client-scout-drone-finds.js";

type Point = { x: number; y: number };
export type FindPlacesState = Pick<ClientState, "tiles" | "me" | "allies">;

const wrap = (v: number, size: number): number => ((v % size) + size) % size;

const isHomeTile = (state: FindPlacesState, x: number, y: number): boolean => {
  const ownerId = state.tiles.get(`${wrap(x, WORLD_WIDTH)},${wrap(y, WORLD_HEIGHT)}`)?.ownerId;
  return Boolean(ownerId && (ownerId === state.me || state.allies.includes(ownerId)));
};

const homeNeighbours = (state: FindPlacesState, p: Point): number => {
  let n = 0;
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx || dy) && isHomeTile(state, p.x + dx, p.y + dy)) n += 1;
  return n;
};

/** `places` without the player's or allies' tiles, those touching their land last (stable otherwise). */
export const reportedPlaces = (state: FindPlacesState, places: readonly Point[]): Point[] =>
  places
    .filter((p) => !isHomeTile(state, p.x, p.y))
    .map((p, i) => ({ p, i, n: homeNeighbours(state, p) }))
    .sort((a, b) => Math.min(a.n, 1) - Math.min(b.n, 1) || a.i - b.i)
    .map(({ p }) => ({ x: p.x, y: p.y }));

/** One place per empire sighted: the first of its tiles that is clear of the player's land. */
const empirePlaces = (state: FindPlacesState, sites: ScoutFindingSites | undefined): Point[] =>
  Object.values(sites?.empires ?? {}).flatMap((tiles) => reportedPlaces(state, tiles).slice(0, 1));

export type ChipPlacesReport = { sites?: ScoutFindingSites | undefined; focusX?: number | undefined; focusY?: number | undefined; targetX: number; targetY: number };

/**
 * Where a report chip's finds are: the ones spotted mid-flight (SCOUT_FINDS); else the report's own sites, which
 * survive a reload or a dropped socket; else the report's main find when it is this chip's kind. Empires use the
 * sites first: they keep several tiles per empire, the mid-flight find only the first one seen.
 */
export const scoutReportChipPlaces = (
  state: FindPlacesState & ScoutFindsState,
  report: ChipPlacesReport,
  mainKind: { kind: ScoutFind["kind"]; resource?: string | undefined } | undefined,
  kind: ScoutFind["kind"],
  resource?: string
): Point[] => {
  if (kind === "empire") {
    const empires = empirePlaces(state, report.sites);
    if (empires.length > 0) return empires;
  }
  const spotted = reportedPlaces(state, scoutFindPlaces(state, kind, resource));
  if (spotted.length > 0) return spotted;
  const sited = reportedPlaces(state, scoutSitesFor(report.sites, kind, resource));
  if (sited.length > 0) return sited;
  if (!mainKind || mainKind.kind !== kind || mainKind.resource !== resource) return [];
  return reportedPlaces(state, [{ x: report.focusX ?? report.targetX, y: report.focusY ?? report.targetY }]);
};
