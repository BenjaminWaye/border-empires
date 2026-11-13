import {
  activeRoadDirections,
  isThroughTile,
  OPPOSITE_DIR,
  ROAD_STEP,
  roadArmPoints,
  roadThroughPoints,
  type RoadDir,
  type XZ
} from "../client-map-3d-road-overlay/client-map-3d-road-centerline.js";
import type { RoadDirections } from "../client-road-network/client-road-network.js";
import { trimArmToStation, type ElevationAt } from "./client-map-3d-monorail-guideway.js";

// Monorail "lines": the stretch of track between two stops (a town station or a
// junction), traced over the whole road network rather than just the visible
// window. Tracing to the real ends, and always running a line from the same
// (canonical) end, keeps each line's length, identity and direction fixed in
// world space, so a train's position (a pure function of time and the line)
// doesn't jump when the camera pans and the window is rebuilt.

export type MonorailLine = {
  readonly id: string;
  readonly xs: Float32Array; // scene X per sample
  readonly ys: Float32Array; // beam centre Y per sample
  readonly zs: Float32Array; // scene Z per sample
  readonly cum: Float32Array; // arc length (world units) per sample
  readonly visible: Uint8Array; // sample lies on a tile whose guideway was drawn
  readonly visibleFrom: number; // arc-length span covering every visible sample
  readonly visibleTo: number;
  readonly length: number;
  readonly ownerTileX: number;
  readonly ownerTileY: number;
};

export type RouteTraceInput = {
  // Only tiles whose guideway was actually drawn this rebuild (in view, not
  // fogged/unexplored) show trains; the rest of a line is traced but hidden.
  readonly isDrawnTile: (wx: number, wy: number) => boolean;
  readonly sceneXOf: (wx: number) => number; // scene X of a world tile column's centre
  readonly sceneZOf: (wy: number) => number;
  readonly roadDirsAt: (wx: number, wy: number) => RoadDirections | undefined;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly elevationAt: ElevationAt;
  readonly railHeight: number;
};

const MAX_LINE_TILES = 160;
const isStop = (dirs: RoadDirections): boolean => !isThroughTile(dirs);

type Step = { readonly ux: number; readonly uy: number; readonly dirs: RoadDirections; readonly entry?: RoadDir; readonly exit?: RoadDir };

// Walk from a stop out along `dir` until the next stop. Coordinates stay
// unwrapped (ux/uy) so scene positions accumulate without seams.
const walk = (input: RouteTraceInput, sx: number, sy: number, dir: RoadDir): Step[] | undefined => {
  const start = input.roadDirsAt(input.wrapX(sx), input.wrapY(sy));
  if (!start) return undefined;
  const steps: Step[] = [{ ux: sx, uy: sy, dirs: start, exit: dir }];
  let ux = sx, uy = sy, heading = dir;
  for (let i = 0; i < MAX_LINE_TILES; i += 1) {
    ux += ROAD_STEP[heading][0];
    uy += ROAD_STEP[heading][1];
    const entry = OPPOSITE_DIR[heading];
    const dirs = input.roadDirsAt(input.wrapX(ux), input.wrapY(uy));
    if (!dirs || dirs[entry] !== true) return undefined;
    if (isStop(dirs)) { steps.push({ ux, uy, dirs, entry }); return steps; }
    const next = activeRoadDirections(dirs).find((d) => d !== entry);
    if (!next) return undefined;
    steps.push({ ux, uy, dirs, entry, exit: next });
    heading = next;
  }
  return undefined;
};

// From a through tile, find the stop at one end and the arm leaving it.
const findStop = (input: RouteTraceInput, wx: number, wy: number, dirs: RoadDirections): { x: number; y: number; dir: RoadDir } | undefined => {
  let ux = wx, uy = wy, cur = dirs, heading = activeRoadDirections(dirs)[0]!;
  for (let i = 0; i < MAX_LINE_TILES; i += 1) {
    const nx = ux + ROAD_STEP[heading][0], ny = uy + ROAD_STEP[heading][1];
    const entry = OPPOSITE_DIR[heading];
    const next = input.roadDirsAt(input.wrapX(nx), input.wrapY(ny));
    if (!next || next[entry] !== true) return undefined;
    if (isStop(next)) return { x: nx, y: ny, dir: entry };
    ux = nx; uy = ny; cur = next;
    heading = activeRoadDirections(cur).find((d) => d !== entry)!;
  }
  return undefined;
};

const endKeys = (input: RouteTraceInput, steps: readonly Step[]): [string, string] => {
  const first = steps[0]!, last = steps[steps.length - 1]!;
  return [
    `${input.wrapX(first.ux)},${input.wrapY(first.uy)}:${first.exit}`,
    `${input.wrapX(last.ux)},${input.wrapY(last.uy)}:${last.entry}`
  ];
};

// The same line walked from its other end: tiles reversed, entry/exit swapped.
const reverseSteps = (steps: readonly Step[]): Step[] =>
  steps.slice().reverse().map((step) => ({ ux: step.ux, uy: step.uy, dirs: step.dirs, ...(step.exit ? { entry: step.exit } : {}), ...(step.entry ? { exit: step.entry } : {}) }));

// Every line runs from its lexicographically smaller end, whichever end the
// scan happened to reach first, so its direction never flips between rebuilds.
const canonicalLine = (input: RouteTraceInput, steps: readonly Step[]): { id: string; steps: readonly Step[] } => {
  const [a, b] = endKeys(input, steps);
  return a <= b ? { id: `${a}|${b}`, steps } : { id: `${b}|${a}`, steps: reverseSteps(steps) };
};

const buildLine = (input: RouteTraceInput, steps: readonly Step[], id: string): MonorailLine | undefined => {
  const first = steps[0]!;
  const baseX = input.sceneXOf(input.wrapX(first.ux)) - first.ux;
  const baseZ = input.sceneZOf(input.wrapY(first.uy)) - first.uy;
  const pts: Array<{ pt: XZ; wx: number; wz: number; vis: boolean }> = [];
  steps.forEach((step, index) => {
    const sx = baseX + step.ux, sz = baseZ + step.uy;
    let line: XZ[];
    if (index === 0 || index === steps.length - 1) {
      const dir = (index === 0 ? step.exit : step.entry)!;
      line = roadArmPoints(input.wrapX(step.ux), input.wrapY(step.uy), sx, sz, dir);
      if (step.dirs.terminal === true) line = trimArmToStation(line, sx, sz);
      if (index !== 0) line = line.slice().reverse();
    } else {
      line = roadThroughPoints(sx, sz, step.entry!, step.exit!);
    }
    const vis = input.isDrawnTile(input.wrapX(step.ux), input.wrapY(step.uy));
    for (const pt of line) {
      const prev = pts[pts.length - 1];
      if (prev && Math.hypot(prev.pt[0] - pt[0], prev.pt[1] - pt[1]) < 1e-4) continue;
      pts.push({ pt, wx: step.ux + 0.5 + (pt[0] - sx), wz: step.uy + 0.5 + (pt[1] - sz), vis });
    }
  });
  if (pts.length < 2 || !pts.some((p) => p.vis)) return undefined;
  const n = pts.length;
  const xs = new Float32Array(n), ys = new Float32Array(n), zs = new Float32Array(n), cum = new Float32Array(n), visible = new Uint8Array(n);
  let visibleFrom = Infinity, visibleTo = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const p = pts[i]!;
    xs[i] = p.pt[0]; zs[i] = p.pt[1];
    visible[i] = p.vis ? 1 : 0;
    ys[i] = p.vis ? input.elevationAt(p.wx, p.wz) + input.railHeight : 0;
    if (i > 0) cum[i] = cum[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, zs[i]! - zs[i - 1]!);
    if (p.vis) { visibleFrom = Math.min(visibleFrom, cum[i]!); visibleTo = Math.max(visibleTo, cum[i]!); }
  }
  return {
    id, xs, ys, zs, cum, visible, visibleFrom, visibleTo, length: cum[n - 1]!,
    ownerTileX: input.wrapX(first.ux), ownerTileY: input.wrapY(first.uy)
  };
};

// Every line touching one of the visible road tiles, each traced once.
export const traceMonorailLines = (input: RouteTraceInput, visibleTiles: ReadonlyArray<{ readonly wx: number; readonly wy: number; readonly dirs: RoadDirections }>): MonorailLine[] => {
  const lines = new Map<string, MonorailLine>();
  const covered = new Set<string>();
  const trace = (sx: number, sy: number, dir: RoadDir): void => {
    const walked = walk(input, sx, sy, dir);
    if (!walked) return;
    for (const step of walked) if (!isStop(step.dirs)) covered.add(`${input.wrapX(step.ux)},${input.wrapY(step.uy)}`);
    const { id, steps } = canonicalLine(input, walked);
    if (lines.has(id)) return;
    const line = buildLine(input, steps, id);
    if (line) lines.set(id, line);
  };
  for (const { wx, wy, dirs } of visibleTiles) {
    if (isStop(dirs)) {
      for (const dir of activeRoadDirections(dirs)) trace(wx, wy, dir);
      continue;
    }
    if (covered.has(`${wx},${wy}`)) continue;
    const stop = findStop(input, wx, wy, dirs);
    if (stop) trace(stop.x, stop.y, stop.dir);
  }
  return [...lines.values()];
};
