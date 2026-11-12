import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Scene,
  type Texture
} from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { BEAM_H, TRACK_GAP } from "./client-map-3d-monorail-guideway.js";
import { createMonorailPool } from "./client-map-3d-monorail-pool.js";
import type { MonorailLine } from "./client-map-3d-monorail-routes.js";

// Three-car trains running both ways along every monorail line, one direction
// per beam (keep right). A train's place on its line is a pure function of the
// clock and the line itself, so it never jumps when the window rebuilds.
// Trains ease out of stops and into the next one, and fade in/out at the stop.

const CAR_LEN = 0.15;
const CAR_SPACING = 0.165;
const CARS = 3;
const CAR_W = 0.05;
const CAR_H = 0.047;
const HEADWAY = 3.4; // tiles between trains on the same beam
const BASE_SPEED = 0.42; // tiles per second, before easing
const RIDE = BEAM_H / 2 + 0.007 + CAR_H / 2; // beam centre -> car centre
const FADE = 0.16;
const MAX_CARS = 900;

const hash01 = (text: string, salt: number): number => {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};

// Slower near both stops, faster mid-line; monotonic, so cars never reorder.
const ease = (x: number): number => x - (Math.sin(2 * Math.PI * x) / (2 * Math.PI)) * 0.6;

export type MonorailTrains = {
  readonly setLines: (lines: readonly MonorailLine[], ownerColorAt: (wx: number, wy: number) => Color | undefined) => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMonorailTrains = (scene: Scene, envMap?: Texture): MonorailTrains => {
  // Capsule along Y (2.4 long, 1 wide) turned to run along X.
  const hullGeo = new CapsuleGeometry(0.5, 1.4, 4, 12).rotateZ(-Math.PI / 2);
  const box = new BoxGeometry(1, 1, 1);
  const hullMat = new MeshStandardMaterial({ color: "#e9edf1", metalness: 0.45, roughness: 0.22 });
  const glassMat = new MeshStandardMaterial({ color: "#0e141b", metalness: 0.9, roughness: 0.08 });
  const liveryMat = new MeshStandardMaterial({ color: "#ffffff", metalness: 0.3, roughness: 0.35 });
  for (const mat of [hullMat, glassMat, liveryMat]) applyBuildingEnvMap(mat, envMap);
  const headMat = new MeshBasicMaterial({ toneMapped: false, color: "#fff4cf" });
  const tailMat = new MeshBasicMaterial({ toneMapped: false, color: "#ff3d33" });
  const underMat = new MeshBasicMaterial({ toneMapped: false, color: "#3fd8ff", transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false });
  const beamMat = new MeshBasicMaterial({ toneMapped: false, color: "#fff1c2", transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false });
  const pools = {
    hull: createMonorailPool(scene, hullGeo, hullMat),
    glass: createMonorailPool(scene, box, glassMat),
    livery: createMonorailPool(scene, box, liveryMat, { colored: true }),
    head: createMonorailPool(scene, box, headMat),
    tail: createMonorailPool(scene, box, tailMat),
    under: createMonorailPool(scene, box, underMat, { renderOrder: 26 }),
    beam: createMonorailPool(scene, box, beamMat, { renderOrder: 27 })
  };
  const all = Object.values(pools);

  type Run = { line: MonorailLine; speed: number; phase: [number, number]; livery: Color };
  let runs: Run[] = [];

  const pos = new Vector3(), fwd = new Vector3(), side = new Vector3(), p = new Vector3(), up = new Vector3(0, 1, 0);

  // Position + 3D tangent at arc length s; false when that stretch isn't drawn.
  const sample = (line: MonorailLine, s: number): boolean => {
    const { cum, xs, ys, zs, visible } = line;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid]! <= s) lo = mid; else hi = mid; }
    if (!visible[lo] || !visible[hi]) return false;
    const seg = cum[hi]! - cum[lo]!;
    const k = seg > 0 ? (s - cum[lo]!) / seg : 0;
    pos.set(xs[lo]! + (xs[hi]! - xs[lo]!) * k, ys[lo]! + (ys[hi]! - ys[lo]!) * k, zs[lo]! + (zs[hi]! - zs[lo]!) * k);
    fwd.set(xs[hi]! - xs[lo]!, ys[hi]! - ys[lo]!, zs[hi]! - zs[lo]!).normalize();
    return true;
  };

  const car = (run: Run, along: number, dir: 1 | -1, index: number, scale: number): void => {
    if (!sample(run.line, along)) return;
    if (dir < 0) fwd.negate();
    side.set(-fwd.z, 0, fwd.x).normalize();
    pos.addScaledVector(side, TRACK_GAP / 2).setY(pos.y + RIDE);
    const h = CAR_H * scale, w = CAR_W * scale, l = CAR_LEN * scale;
    pools.hull.place(pos, fwd, up, l / 2.4, h, w);
    pools.glass.place(p.copy(pos).setY(pos.y + h * 0.13), fwd, up, l * 0.74, h * 0.3, w * 1.02);
    pools.livery.place(p.copy(pos).setY(pos.y - h * 0.2), fwd, up, l * 0.86, h * 0.13, w * 1.03);
    pools.livery.color(run.livery);
    pools.under.place(p.copy(pos).setY(pos.y - CAR_H / 2 - 0.006), fwd, up, l * 0.95, 0.002, w * 1.9);
    if (index === 0) {
      pools.head.place(p.copy(pos).addScaledVector(fwd, l / 2 - 0.004), fwd, up, 0.008, h * 0.22, w * 0.62);
      pools.beam.place(p.copy(pos).addScaledVector(fwd, l / 2 + 0.07).setY(pos.y - h * 0.15), fwd, up, 0.14, 0.003, w * 0.8);
    }
    if (index === CARS - 1) pools.tail.place(p.copy(pos).addScaledVector(fwd, -l / 2 + 0.004), fwd, up, 0.008, h * 0.18, w * 0.6);
  };

  return {
    setLines: (lines, ownerColorAt) => {
      runs = lines.map((line) => ({
        line,
        speed: BASE_SPEED * (0.85 + hash01(line.id, 1) * 0.3),
        phase: [hash01(line.id, 2) * HEADWAY, hash01(line.id, 3) * HEADWAY],
        livery: ownerColorAt(line.ownerTileX, line.ownerTileY)?.clone() ?? new Color("#8fa3b5")
      }));
    },
    update: (nowMs) => {
      for (const pool of all) pool.begin();
      const t = nowMs / 1000;
      let cars = 0;
      for (const run of runs) {
        const L = run.line.length;
        if (L < 0.3) continue;
        // Arc length is eased per train, so a train's cars stay coupled while
        // the train as a whole slows into a stop.
        for (const dir of [1, -1] as const) {
          const head0 = (((t * run.speed + run.phase[dir > 0 ? 0 : 1]) % HEADWAY) + HEADWAY) % HEADWAY;
          // Head runs 0 -> L + consist length, so the last car clears the stop too.
          const travel = L + CAR_SPACING * CARS;
          for (let head = head0; head < travel; head += HEADWAY) {
            const eased = travel * ease(head / travel);
            for (let k = 0; k < CARS; k += 1) {
              const s = eased - k * CAR_SPACING;
              if (s < 0 || s > L || cars >= MAX_CARS) continue;
              const edge = Math.min(s, L - s);
              const scale = edge < FADE ? Math.max(0.05, edge / FADE) : 1;
              car(run, dir > 0 ? s : L - s, dir, k, scale);
              cars += 1;
            }
          }
        }
      }
      for (const pool of all) pool.end();
    },
    dispose: () => {
      for (const pool of all) pool.dispose();
      hullGeo.dispose(); box.dispose();
      for (const mat of [hullMat, glassMat, liveryMat, headMat, tailMat, underMat, beamMat]) mat.dispose();
    }
  };
};
