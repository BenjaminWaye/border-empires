import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Color,
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
import { createBeamGlowTexture, createBeamPanelTexture } from "./client-map-3d-monorail-textures.js";

// The maglev freight line's static structure: twin graphite guideway beams
// carried on Y-forked pylons along every road tile. Each beam carries a lit
// levitation line on top and induction-coil lights down its sides. Through
// tiles get one pylon under the curve's midpoint; junctions get a heavy pylon
// with a glowing switching deck and a red beacon; town tiles end the line at a
// freight gantry with a scanner bar on the edge of the town.

export const RAIL_HEIGHT = 0.3;
export const TRACK_GAP = 0.112;
export const BEAM_W = 0.028;
export const BEAM_H = 0.036;
const WARNING_ON = new Color("#ff3b2f");
const WARNING_OFF = new Color("#4a120e");
const TRACK_SIDES = [-1, 1] as const;
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
  const hex = new CylinderGeometry(1, 1, 1, 6);
  // Spans stretch along local X, so the column's axis is turned from Y to X.
  const column = new CylinderGeometry(0.62, 1, 1, 6).rotateZ(-Math.PI / 2);
  const disc = new CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const graphite = new MeshStandardMaterial({ color: "#2b3038", metalness: 0.82, roughness: 0.3 });
  const beamTex = createBeamPanelTexture();
  const beamGlow = createBeamGlowTexture();
  // Coil lights + levitation line are an emissive map on the beam itself.
  const beamMat = new MeshStandardMaterial({ color: "#3e4650", map: beamTex, metalness: 0.85, roughness: 0.24, emissive: "#46dcff", emissiveMap: beamGlow, emissiveIntensity: 1.1 });
  const plinth = new MeshStandardMaterial({ color: "#1c2026", metalness: 0.6, roughness: 0.5 });
  for (const mat of [graphite, beamMat, plinth]) applyBuildingEnvMap(mat, envMap);
  const field = new MeshBasicMaterial({ toneMapped: false, color: "#8ff6ff" });
  const warning = new MeshBasicMaterial({ toneMapped: false, color: "#ff3b2f" });
  const shadow = new MeshBasicMaterial({ toneMapped: false, color: "#05080b", transparent: true, opacity: 0.3, depthWrite: false });

  const pools = {
    footing: createMonorailPool(scene, hex, plinth),
    footRing: createMonorailPool(scene, hex, field),
    column: createMonorailPool(scene, column, graphite),
    arm: createMonorailPool(scene, box, graphite),
    seam: createMonorailPool(scene, box, field),
    beam: createMonorailPool(scene, box, beamMat),
    deck: createMonorailPool(scene, hex, graphite),
    rim: createMonorailPool(scene, hex, field),
    warning: createMonorailPool(scene, box, warning),
    shadow: createMonorailPool(scene, disc, shadow, { renderOrder: 24 })
  } satisfies Record<string, MonorailPool>;
  const all = Object.values(pools);

  // Hex plinth with a glowing ring at its foot.
  const foot = (ground: Vector3, r: number): void => {
    pools.shadow.upright(p.copy(ground).setY(ground.y + 0.004), r * 3.4, 1, r * 3.4);
    pools.footRing.upright(p.copy(ground).setY(ground.y + 0.006), r * 2.5, 0.006, r * 2.5);
    pools.footing.upright(p.copy(ground).setY(ground.y + 0.012), r * 2.2, 0.024, r * 2.2);
  };

  // Slim tapered column that forks into two arms, one under each beam.
  const pylon = (ground: Vector3, forward: Vector3): void => {
    const forkY = ground.y + RAIL_HEIGHT * 0.6;
    const beamUnderside = ground.y + RAIL_HEIGHT - BEAM_H / 2;
    foot(ground, 0.02);
    pools.column.span(p.copy(ground), a.copy(ground).setY(forkY), 0.04, 0.04);
    side.set(-forward.z, 0, forward.x).normalize();
    // Lit seam up the column's face, turned toward the track direction.
    pools.seam.span(p.copy(ground).addScaledVector(forward, 0.016).setY(ground.y + 0.03), a.copy(ground).addScaledVector(forward, 0.013).setY(forkY - 0.01), 0.004, 0.004);
    for (const sign of [-1, 1]) {
      b.copy(ground).addScaledVector(side, sign * TRACK_GAP / 2).setY(beamUnderside);
      pools.arm.span(a.copy(ground).setY(forkY - 0.008), b, 0.016, 0.02, forward);
      pools.arm.place(b.setY(beamUnderside - 0.006), side, UP, BEAM_W + 0.014, 0.012, 0.03);
    }
  };

  // Twin beams along a centreline polyline; their lights are in the emissive map.
  const beams = (line: readonly XZ[], toWorld: (pt: XZ) => [number, number], elevationAt: ElevationAt): void => {
    const pts = line.map((pt) => {
      const [wx, wz] = toWorld(pt);
      return new Vector3(pt[0], elevationAt(wx, wz) + RAIL_HEIGHT, pt[1]);
    });
    for (let i = 1; i < pts.length; i += 1) {
      const p0 = pts[i - 1]!, p1 = pts[i]!;
      t.subVectors(p1, p0).normalize();
      side.set(-t.z, 0, t.x).normalize();
      for (const sign of TRACK_SIDES) {
        a.copy(p0).addScaledVector(side, sign * TRACK_GAP / 2).addScaledVector(t, -0.003);
        b.copy(p1).addScaledVector(side, sign * TRACK_GAP / 2).addScaledVector(t, 0.003);
        pools.beam.span(a, b, BEAM_W, BEAM_H);
      }
    }
  };

  const tangentAt = (line: readonly XZ[], i: number, out: Vector3): Vector3 => {
    const p0 = line[Math.max(0, i - 1)]!, p1 = line[Math.min(line.length - 1, i + 1)]!;
    return out.set(p1[0] - p0[0], 0, p1[1] - p0[1]).normalize();
  };

  // Freight gantry where the line meets a town: two legs, a lintel with a
  // scanner bar over both tracks, and red marker lights at its ends.
  const stationGate = (line: readonly XZ[], toWorld: (pt: XZ) => [number, number], elevationAt: ElevationAt): void => {
    const start = line[0]!;
    const [wx, wz] = toWorld(start);
    const ground = new Vector3(start[0], elevationAt(wx, wz), start[1]);
    const fwd = tangentAt(line, 0, new Vector3());
    side.set(-fwd.z, 0, fwd.x).normalize();
    const halfSpan = TRACK_GAP / 2 + BEAM_W + 0.02;
    const top = RAIL_HEIGHT + 0.12;
    for (const sign of [-1, 1]) {
      a.copy(ground).addScaledVector(side, sign * halfSpan);
      foot(a, 0.018);
      pools.column.span(a, b.copy(a).setY(a.y + top), 0.032, 0.032);
      pools.warning.upright(p.copy(a).setY(a.y + top + 0.004), 0.014, 0.014, 0.014);
    }
    pools.arm.place(p.copy(ground).setY(ground.y + top - 0.012), side, UP, halfSpan * 2 + 0.03, 0.026, 0.05);
    pools.seam.place(p.copy(ground).setY(ground.y + top - 0.028), side, UP, halfSpan * 2 - 0.02, 0.005, 0.03);
    pools.arm.place(p.copy(ground).setY(ground.y + RAIL_HEIGHT - BEAM_H / 2 - 0.012), side, UP, halfSpan * 2, 0.02, 0.04);
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
      pylon(new Vector3(mid[0], elevationAt(wx, wz), mid[1]), tangentAt(line, midIndex, new Vector3()));
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
    // Junction: heavy column, glowing switching deck, beacon spire.
    for (const dir of arms) beams(roadArmPoints(tileX, tileY, sceneX, sceneZ, dir), toWorld, elevationAt);
    const ground = new Vector3(sceneX, elevationAt(tileX + 0.5, tileY + 0.5), sceneZ);
    const deckY = ground.y + RAIL_HEIGHT - BEAM_H / 2 - 0.012;
    foot(ground, 0.03);
    pools.column.span(p.copy(ground), a.copy(ground).setY(deckY), 0.06, 0.06);
    pools.deck.upright(p.copy(ground).setY(deckY), DECK_RADIUS, 0.022, DECK_RADIUS);
    // Slightly wider glowing slab inside the deck: only its edge shows, as a lit rim.
    pools.rim.upright(p.copy(ground).setY(deckY), DECK_RADIUS + 0.007, 0.008, DECK_RADIUS + 0.007);
    pools.column.span(p.copy(ground).setY(deckY), a.copy(ground).setY(deckY + 0.14), 0.016, 0.016);
    pools.warning.upright(p.copy(ground).setY(deckY + 0.146), 0.022, 0.022, 0.022);
  };

  return {
    clear: () => { for (const pool of all) pool.begin(); },
    addTile,
    commit: () => { for (const pool of all) pool.end(); },
    // Slow double-blink on the beacons; the coil lights breathe.
    update: (nowMs) => {
      const phase = (nowMs / 1000) % 2.4;
      const on = phase < 0.12 || (phase > 0.3 && phase < 0.42);
      warning.color.copy(on ? WARNING_ON : WARNING_OFF);
      beamMat.emissiveIntensity = 1.1 * (0.7 + 0.3 * Math.sin((nowMs / 1000) * 1.9));
    },
    dispose: () => {
      for (const pool of all) pool.dispose();
      for (const g of [box, hex, column, disc]) g.dispose();
      beamTex.dispose(); beamGlow.dispose();
      for (const mat of [graphite, beamMat, plinth, field, warning, shadow]) mat.dispose();
    }
  };
};
