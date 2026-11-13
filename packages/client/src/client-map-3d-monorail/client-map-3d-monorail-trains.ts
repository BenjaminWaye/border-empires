import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Scene,
  type Texture
} from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { BEAM_H, RAIL_HEIGHT, TRACK_GAP } from "./client-map-3d-monorail-guideway.js";
import { createMonorailPool } from "./client-map-3d-monorail-pool.js";
import type { MonorailLine } from "./client-map-3d-monorail-routes.js";
import { createCorrugationTexture, createHullPanelTexture } from "./client-map-3d-monorail-textures.js";

// Maglev freight haulers running both ways along every monorail line, one
// direction per beam (keep right): a windowless wedge-nosed drive unit pulling
// four cargo modules -- containers, pressure tanks or energy cells, one kind
// per line. Cars hover on a lit levitation field, never touching the beam.
// A train's place on its line is a pure function of the clock and the line,
// so it never jumps when the window rebuilds. Trains ease out of stops and
// into the next one, and fade in/out at the stop.

const LOCO_LEN = 0.17;
const MODULE_LEN = 0.135;
const MODULES = 4;
const COUPLING = 0.014;
const CAR_W = 0.058;
const CAR_H = 0.05;
const HOVER = 0.012; // visible maglev gap between beam top and car underside
const HEADWAY = 3.6; // tiles between trains on the same beam
const BASE_SPEED = 0.4; // tiles per second, before easing
const RIDE = BEAM_H / 2 + HOVER + CAR_H / 2; // beam centre -> car centre
const FADE = 0.16;
const MAX_CARS = 1000;

// Car centres measured back from the train's head.
const CAR_OFFSETS: readonly number[] = (() => {
  const out = [LOCO_LEN / 2];
  let end = LOCO_LEN;
  for (let i = 0; i < MODULES; i += 1) { out.push(end + COUPLING + MODULE_LEN / 2); end += COUPLING + MODULE_LEN; }
  return out;
})();
const CONSIST_LEN = LOCO_LEN + MODULES * (COUPLING + MODULE_LEN);

type Cargo = "containers" | "tanks" | "cells";
const CARGO: readonly Cargo[] = ["containers", "tanks", "cells"];
// Industrial freight colours, so trains stand out against the graphite beams.
const CONTAINER_TONES = ["#d98a2b", "#3d8fa8", "#d3d8dc", "#5b6670", "#b5452f"].map((c) => new Color(c));

const hash01 = (text: string, salt: number): number => {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};

// Slower near both stops, faster mid-line; monotonic, so cars never reorder.
const ease = (x: number): number => x - (Math.sin(2 * Math.PI * x) / (2 * Math.PI)) * 0.6;

// Unit box whose front (+X) top edge is swept down and pinched in: the drive
// unit's wedge nose.
const wedgeGeometry = (): BoxGeometry => {
  const g = new BoxGeometry(1, 1, 1, 2, 1, 1);
  const position = g.attributes.position!;
  for (let i = 0; i < position.count; i += 1) {
    if (position.getX(i) < 0.49) continue;
    if (position.getY(i) > 0) position.setY(i, position.getY(i) - 0.62);
    position.setZ(i, position.getZ(i) * 0.72);
  }
  g.computeVertexNormals();
  return g;
};

export type MonorailTrains = {
  readonly setLines: (lines: readonly MonorailLine[], ownerColorAt: (wx: number, wy: number) => Color | undefined) => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMonorailTrains = (scene: Scene, envMap?: Texture): MonorailTrains => {
  const wedge = wedgeGeometry();
  const box = new BoxGeometry(1, 1, 1);
  // Capsule along Y (2 long, 1 wide) turned to run along X.
  const tankGeo = new CapsuleGeometry(0.5, 1, 4, 10).rotateZ(-Math.PI / 2);
  const disc = new CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
  const hullTex = createHullPanelTexture();
  const corrugation = createCorrugationTexture();
  const hullMat = new MeshStandardMaterial({ color: "#d6dce1", map: hullTex, metalness: 0.7, roughness: 0.26 });
  const frameMat = new MeshStandardMaterial({ color: "#181c21", metalness: 0.7, roughness: 0.45 });
  const moduleMat = new MeshStandardMaterial({ color: "#ffffff", map: corrugation, metalness: 0.45, roughness: 0.5 });
  const tankMat = new MeshStandardMaterial({ color: "#d4d9de", metalness: 0.9, roughness: 0.18 });
  const liveryMat = new MeshStandardMaterial({ color: "#ffffff", metalness: 0.3, roughness: 0.35 });
  for (const mat of [hullMat, frameMat, moduleMat, tankMat, liveryMat]) applyBuildingEnvMap(mat, envMap);
  const sensorMat = new MeshBasicMaterial({ toneMapped: false, color: "#7ff3ff" });
  const markerMat = new MeshBasicMaterial({ toneMapped: false, color: "#ff3d33" });
  const cellMat = new MeshBasicMaterial({ toneMapped: false, color: "#b48cff" });
  const fieldMat = new MeshBasicMaterial({ toneMapped: false, color: "#3fd8ff", transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false });
  const haloMat = new MeshBasicMaterial({ toneMapped: false, color: "#bff8ff", transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false });
  const thrustMat = new MeshBasicMaterial({ toneMapped: false, color: "#ff5a3c", transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false });
  const groundShadowMat = new MeshBasicMaterial({ toneMapped: false, color: "#05080b", transparent: true, opacity: 0.18, depthWrite: false });
  const pools = {
    nose: createMonorailPool(scene, wedge, hullMat),
    frame: createMonorailPool(scene, box, frameMat),
    module: createMonorailPool(scene, box, moduleMat, { colored: true }),
    tank: createMonorailPool(scene, tankGeo, tankMat),
    livery: createMonorailPool(scene, box, liveryMat, { colored: true }),
    sensor: createMonorailPool(scene, box, sensorMat),
    marker: createMonorailPool(scene, box, markerMat),
    cell: createMonorailPool(scene, box, cellMat),
    field: createMonorailPool(scene, box, fieldMat, { renderOrder: 26 }),
    halo: createMonorailPool(scene, disc, haloMat, { renderOrder: 27 }),
    thrust: createMonorailPool(scene, disc, thrustMat, { renderOrder: 27 }),
    groundShadow: createMonorailPool(scene, disc, groundShadowMat, { renderOrder: 24 })
  };
  const all = Object.values(pools);

  type Run = { line: MonorailLine; speed: number; phase: [number, number]; livery: Color; cargo: Cargo; tones: Color[] };
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

  const at = (dx: number, dy: number): Vector3 => p.copy(pos).addScaledVector(fwd, dx).setY(pos.y + dy);

  const driveUnit = (run: Run, s: number): void => {
    const h = CAR_H * s, w = CAR_W * s, l = LOCO_LEN * s;
    pools.nose.place(pos, fwd, up, l, h, w);
    pools.livery.place(at(-l * 0.12, -h * 0.18), fwd, up, l * 0.6, h * 0.16, w * 1.03);
    pools.livery.color(run.livery);
    // Sensor slit across the sloped nose, a light bar along the roof spine,
    // and soft halos round the twin headlamps.
    pools.sensor.place(at(l * 0.36, h * 0.02), fwd, up, l * 0.05, h * 0.1, w * 0.62);
    pools.sensor.place(at(-l * 0.2, h / 2 + 0.001), fwd, up, l * 0.45, 0.003, w * 0.12);
    for (const k of [-0.28, 0.28]) {
      p.copy(pos).addScaledVector(fwd, l * 0.5).addScaledVector(side, w * k).setY(pos.y - h * 0.18);
      pools.halo.place(p, fwd, up, 0.05 * s, 1, 0.05 * s);
    }
  };

  const cargoModule = (run: Run, index: number, last: boolean, s: number): void => {
    const h = CAR_H * s, w = CAR_W * s, l = MODULE_LEN * s;
    pools.frame.place(at(0, -h * 0.4), fwd, up, l, h * 0.2, w);
    if (run.cargo === "containers") {
      pools.module.place(at(0, h * 0.1), fwd, up, l * 0.94, h * 0.8, w * 0.96);
      pools.module.color(run.tones[index % run.tones.length]!);
      for (const k of [-0.25, 0.25]) pools.frame.place(at(l * k, h * 0.1), fwd, up, l * 0.05, h * 0.84, w * 1.0);
    } else if (run.cargo === "tanks") {
      pools.tank.place(at(0, h * 0.12), fwd, up, l * 0.47, h * 0.72, w * 0.8);
      pools.frame.place(at(0, h * 0.12), fwd, up, l * 0.06, h * 0.78, w * 0.86);
    } else {
      // Open-top cradle: the glowing cells stay visible from the camera above.
      for (const k of [-0.3, 0, 0.3]) pools.cell.place(at(l * k, h * 0.12), fwd, up, l * 0.2, h * 0.8, w * 0.62);
      for (const k of [-0.46, 0.46]) {
        p.copy(pos).addScaledVector(side, w * k).setY(pos.y - h * 0.18);
        pools.frame.place(p, fwd, up, l * 0.96, h * 0.28, w * 0.06);
      }
    }
    if (last) {
      pools.marker.place(at(-l / 2 - 0.002, 0), fwd, up, 0.006, h * 0.18, w * 0.7);
      pools.thrust.place(at(-l / 2 - 0.02, -h * 0.05), fwd, up, 0.05 * s, 1, w * 0.9);
    }
  };

  const car = (run: Run, along: number, dir: 1 | -1, index: number, scale: number): void => {
    if (!sample(run.line, along)) return;
    if (dir < 0) fwd.negate();
    side.set(-fwd.z, 0, fwd.x).normalize();
    pos.addScaledVector(side, TRACK_GAP / 2);
    // Levitation field in the gap under the car, then the car itself above it.
    const length = index === 0 ? LOCO_LEN : MODULE_LEN;
    pools.field.place(p.copy(pos).setY(pos.y + BEAM_H / 2 + HOVER * 0.45), fwd, up, length * scale * 0.9, HOVER * 0.7, CAR_W * scale * 0.7);
    // Soft shadow on the ground under each car (the beam stands RAIL_HEIGHT up).
    pools.groundShadow.place(p.copy(pos).setY(pos.y - RAIL_HEIGHT + 0.008).addScaledVector(side, 0.012), fwd, up, length * scale * 1.3, 1, CAR_W * scale * 1.25);
    pos.setY(pos.y + RIDE);
    if (index === 0) driveUnit(run, scale);
    else cargoModule(run, index - 1, index === MODULES, scale);
  };

  return {
    setLines: (lines, ownerColorAt) => {
      runs = lines.map((line) => {
        const shift = Math.floor(hash01(line.id, 5) * CONTAINER_TONES.length);
        return {
          line,
          speed: BASE_SPEED * (0.85 + hash01(line.id, 1) * 0.3),
          phase: [hash01(line.id, 2) * HEADWAY, hash01(line.id, 3) * HEADWAY],
          livery: ownerColorAt(line.ownerTileX, line.ownerTileY)?.clone() ?? new Color("#8fa3b5"),
          cargo: CARGO[Math.floor(hash01(line.id, 4) * CARGO.length)]!,
          tones: CONTAINER_TONES.map((_, i) => CONTAINER_TONES[(i + shift) % CONTAINER_TONES.length]!)
        };
      });
    },
    update: (nowMs) => {
      for (const pool of all) pool.begin();
      const t = nowMs / 1000;
      // The energy cells and levitation field breathe slowly.
      fieldMat.opacity = 0.45 + 0.15 * Math.sin(t * 2.4);
      cellMat.color.setRGB(0.62 + 0.12 * Math.sin(t * 1.7), 0.45, 1);
      let cars = 0;
      for (const run of runs) {
        const L = run.line.length;
        if (L < 0.3) continue;
        // Arc length is eased per train, so a train's cars stay coupled while
        // the train as a whole slows into a stop.
        for (const dir of [1, -1] as const) {
          const head0 = (((t * run.speed + run.phase[dir > 0 ? 0 : 1]) % HEADWAY) + HEADWAY) % HEADWAY;
          // Head runs 0 -> L + consist length, so the last car clears the stop too.
          const travel = L + CONSIST_LEN;
          for (let head = head0; head < travel; head += HEADWAY) {
            const eased = travel * ease(head / travel);
            for (let k = 0; k < CAR_OFFSETS.length; k += 1) {
              const s = eased - CAR_OFFSETS[k]!;
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
      for (const g of [wedge, box, tankGeo, disc]) g.dispose();
      for (const tex of [hullTex, corrugation]) tex.dispose();
      for (const mat of [hullMat, frameMat, moduleMat, tankMat, liveryMat, sensorMat, markerMat, cellMat, fieldMat, haloMat, thrustMat, groundShadowMat]) mat.dispose();
    }
  };
};
