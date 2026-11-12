import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Scene,
  type Texture
} from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import {
  activeRoadDirections,
  isThroughTile,
  roadArmPoints,
  roadThroughPoints,
  type XZ
} from "../client-map-3d-road-overlay/client-map-3d-road-centerline.js";
import type { RoadDirections } from "../client-road-network/client-road-network.js";
import { createMonorailPool, type MonorailPool } from "./client-map-3d-monorail-pool.js";

// The monorail's static structure: a twin-beam guideway carried on pylons along
// every road tile. Through tiles get one pylon under the curve's midpoint;
// junctions get a heavier pylon with a switching deck and a red warning light;
// town tiles end the line at a lit station gate on the edge of the town.

export const RAIL_HEIGHT = 0.3;
export const TRACK_GAP = 0.095;
export const BEAM_W = 0.03;
export const BEAM_H = 0.042;
// Beams stop this far from a town's centre so they meet the town model's edge.
export const STATION_RADIUS = 0.42;
const DECK_RADIUS = 0.165;

export type ElevationAt = (wx: number, wz: number) => number;

const UP = new Vector3(0, 1, 0);
const a = new Vector3(), b = new Vector3(), t = new Vector3(), side = new Vector3(), p = new Vector3();

// Keep the part of a centre->edge arm outside the town's footprint, starting
// exactly on the STATION_RADIUS circle.
export const trimArmToStation = (points: readonly XZ[], cx: number, cz: number): XZ[] => {
  const out: XZ[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    const d = Math.hypot(pt[0] - cx, pt[1] - cz);
    if (d < STATION_RADIUS) continue;
    const prev = points[i - 1];
    if (out.length === 0 && prev) {
      const dp = Math.hypot(prev[0] - cx, prev[1] - cz);
      const k = (STATION_RADIUS - dp) / Math.max(1e-6, d - dp);
      out.push([prev[0] + (pt[0] - prev[0]) * k, prev[1] + (pt[1] - prev[1]) * k]);
    }
    out.push(pt);
  }
  return out;
};

export type MonorailGuideway = {
  readonly clear: () => void;
  readonly addTile: (tileX: number, tileY: number, sceneX: number, sceneZ: number, elevationAt: ElevationAt, dirs: RoadDirections) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMonorailGuideway = (scene: Scene, envMap?: Texture): MonorailGuideway => {
  const box = new BoxGeometry(1, 1, 1);
  const oct = new CylinderGeometry(1, 1, 1, 8);
  // Spans stretch along local X, so the column's axis is turned from Y to X.
  const column = new CylinderGeometry(0.72, 1, 1, 8).rotateZ(-Math.PI / 2);
  const disc = new CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const concrete = new MeshStandardMaterial({ color: "#a7adb3", metalness: 0.15, roughness: 0.78 });
  const steel = new MeshStandardMaterial({ color: "#3a4048", metalness: 0.75, roughness: 0.32 });
  const plate = new MeshStandardMaterial({ color: "#c3c9cf", metalness: 0.85, roughness: 0.22 });
  const trim = new MeshStandardMaterial({ color: "#20252c", metalness: 0.6, roughness: 0.4 });
  for (const mat of [concrete, steel, plate, trim]) applyBuildingEnvMap(mat, envMap);
  const power = new MeshBasicMaterial({ toneMapped: false, color: "#5fe3ff" });
  const warning = new MeshBasicMaterial({ toneMapped: false, color: "#ff3b2f" });
  const shadow = new MeshBasicMaterial({ toneMapped: false, color: "#05080b", transparent: true, opacity: 0.3, depthWrite: false });

  const pools = {
    footing: createMonorailPool(scene, oct, concrete),
    column: createMonorailPool(scene, column, concrete),
    collar: createMonorailPool(scene, oct, trim),
    crosshead: createMonorailPool(scene, box, steel),
    beam: createMonorailPool(scene, box, steel),
    plate: createMonorailPool(scene, box, plate),
    power: createMonorailPool(scene, box, power),
    deck: createMonorailPool(scene, oct, plate),
    rim: createMonorailPool(scene, oct, power),
    warning: createMonorailPool(scene, box, warning),
    shadow: createMonorailPool(scene, disc, shadow, { renderOrder: 24 })
  } satisfies Record<string, MonorailPool>;
  const all = Object.values(pools);

  const pylon = (ground: Vector3, forward: Vector3, heavy: boolean): void => {
    const r = heavy ? 0.034 : 0.024;
    const headBottom = RAIL_HEIGHT - BEAM_H / 2 - (heavy ? 0.025 : 0.03);
    pools.shadow.upright(p.copy(ground).setY(ground.y + 0.004), r * 3.2, 1, r * 3.2);
    pools.footing.upright(p.copy(ground).setY(ground.y + 0.012), r * 2.1, 0.024, r * 2.1);
    pools.column.span(p.copy(ground), a.copy(ground).setY(ground.y + headBottom), r * 2, r * 2);
    pools.collar.upright(p.copy(ground).setY(ground.y + headBottom - 0.008), r * 1.25, 0.016, r * 1.25);
    if (heavy) return;
    side.set(-forward.z, 0, forward.x).normalize();
    pools.crosshead.place(p.copy(ground).setY(ground.y + headBottom + 0.014), side, UP, TRACK_GAP + BEAM_W + 0.03, 0.028, 0.04);
  };

  // Twin beams along a centreline polyline, `lift` is the ground-to-beam rise.
  const beams = (line: readonly XZ[], toWorld: (pt: XZ) => [number, number], elevationAt: ElevationAt): void => {
    const pts = line.map((pt) => {
      const [wx, wz] = toWorld(pt);
      return new Vector3(pt[0], elevationAt(wx, wz) + RAIL_HEIGHT, pt[1]);
    });
    for (let i = 1; i < pts.length; i += 1) {
      const p0 = pts[i - 1]!, p1 = pts[i]!;
      t.subVectors(p1, p0).normalize();
      side.set(-t.z, 0, t.x).normalize();
      for (const sign of [-1, 1]) {
        a.copy(p0).addScaledVector(side, sign * TRACK_GAP / 2).addScaledVector(t, -0.003);
        b.copy(p1).addScaledVector(side, sign * TRACK_GAP / 2).addScaledVector(t, 0.003);
        pools.beam.span(a, b, BEAM_W, BEAM_H);
        pools.power.span(a.setY(a.y - 0.004), b.setY(b.y - 0.004), BEAM_W + 0.006, 0.006);
        pools.plate.span(a.setY(a.y + 0.004 + BEAM_H / 2), b.setY(b.y + 0.004 + BEAM_H / 2), BEAM_W + 0.004, 0.006);
      }
    }
  };

  const tangentAt = (line: readonly XZ[], i: number, out: Vector3): Vector3 => {
    const p0 = line[Math.max(0, i - 1)]!, p1 = line[Math.min(line.length - 1, i + 1)]!;
    return out.set(p1[0] - p0[0], 0, p1[1] - p0[1]).normalize();
  };

  const stationGate = (line: readonly XZ[], toWorld: (pt: XZ) => [number, number], elevationAt: ElevationAt): void => {
    const start = line[0]!;
    const [wx, wz] = toWorld(start);
    const ground = new Vector3(start[0], elevationAt(wx, wz), start[1]);
    const fwd = tangentAt(line, 0, new Vector3());
    side.set(-fwd.z, 0, fwd.x).normalize();
    const halfSpan = TRACK_GAP / 2 + BEAM_W + 0.012;
    const top = RAIL_HEIGHT + 0.075;
    for (const sign of [-1, 1]) {
      a.copy(ground).addScaledVector(side, sign * halfSpan);
      pools.shadow.upright(p.copy(a).setY(a.y + 0.004), 0.05, 1, 0.05);
      pools.footing.upright(p.copy(a).setY(a.y + 0.012), 0.04, 0.024, 0.04);
      pools.column.span(a, b.copy(a).setY(a.y + top), 0.03, 0.03);
    }
    pools.crosshead.place(p.copy(ground).setY(ground.y + top), side, UP, halfSpan * 2 + 0.03, 0.03, 0.045);
    pools.power.place(p.copy(ground).setY(ground.y + top - 0.019), side, UP, halfSpan * 2 - 0.02, 0.006, 0.02);
    pools.crosshead.place(p.copy(ground).setY(ground.y + RAIL_HEIGHT - BEAM_H / 2 - 0.016), side, UP, halfSpan * 2, 0.026, 0.04);
  };

  const addTile = (tileX: number, tileY: number, sceneX: number, sceneZ: number, elevationAt: ElevationAt, dirs: RoadDirections): void => {
    const arms = activeRoadDirections(dirs);
    if (arms.length === 0) return;
    const toWorld = (pt: XZ): [number, number] => [tileX + 0.5 + (pt[0] - sceneX), tileY + 0.5 + (pt[1] - sceneZ)];
    if (isThroughTile(dirs)) {
      const line = roadThroughPoints(sceneX, sceneZ, arms[0]!, arms[1]!);
      beams(line, toWorld, elevationAt);
      const midIndex = Math.floor(line.length / 2);
      const mid = line[midIndex]!;
      const [wx, wz] = toWorld(mid);
      pylon(new Vector3(mid[0], elevationAt(wx, wz), mid[1]), tangentAt(line, midIndex, new Vector3()), false);
      return;
    }
    if (dirs.terminal === true) {
      for (const dir of arms) {
        const line = trimArmToStation(roadArmPoints(tileX, tileY, sceneX, sceneZ, dir), sceneX, sceneZ);
        if (line.length < 2) continue;
        beams(line, toWorld, elevationAt);
        stationGate(line, toWorld, elevationAt);
      }
      return;
    }
    for (const dir of arms) beams(roadArmPoints(tileX, tileY, sceneX, sceneZ, dir), toWorld, elevationAt);
    const ground = new Vector3(sceneX, elevationAt(tileX + 0.5, tileY + 0.5), sceneZ);
    pylon(ground, new Vector3(1, 0, 0), true);
    const deckY = ground.y + RAIL_HEIGHT - BEAM_H / 2 - 0.012;
    pools.deck.upright(p.copy(ground).setY(deckY), DECK_RADIUS, 0.024, DECK_RADIUS);
    // Slightly wider glowing slab inside the deck: only its edge shows, as a lit rim.
    pools.rim.upright(p.copy(ground).setY(deckY), DECK_RADIUS + 0.006, 0.008, DECK_RADIUS + 0.006);
    pools.column.span(p.copy(ground).setY(deckY), a.copy(ground).setY(deckY + 0.11), 0.014, 0.014);
    pools.warning.upright(p.copy(ground).setY(deckY + 0.118), 0.026, 0.026, 0.026);
  };

  return {
    clear: () => { for (const pool of all) pool.begin(); },
    addTile,
    commit: () => { for (const pool of all) pool.end(); },
    // Slow double-blink on the junction warning lights.
    update: (nowMs) => {
      const phase = (nowMs / 1000) % 2.4;
      const on = phase < 0.12 || (phase > 0.3 && phase < 0.42);
      warning.color.set(on ? "#ff3b2f" : "#4a120e");
    },
    dispose: () => {
      for (const pool of all) pool.dispose();
      for (const g of [box, oct, column, disc]) g.dispose();
      for (const mat of [concrete, steel, plate, trim, power, warning, shadow]) mat.dispose();
    }
  };
};
