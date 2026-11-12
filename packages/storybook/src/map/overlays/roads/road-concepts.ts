import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Scene
} from "three";
import { batch, pointAt, uniquePoints, type Batch, type ConceptPath } from "./road-concept-kit.js";

// Five structurally different takes on "the link between two towns". Each is
// built from real geometry (not a texture on a ground ribbon) so they read
// differently from each other at map zoom. Storybook-only design spikes.

export type RoadConcept = "conduit" | "monorail" | "traffic" | "beacons" | "relays";
export type ConceptScene = { readonly update: (seconds: number) => void; readonly dispose: () => void };

type Ctx = {
  readonly scene: Scene;
  readonly paths: readonly ConceptPath[];
  readonly hubs: readonly Vector3[];
  readonly own: (g: BufferGeometry | Material) => void;
};

const glowMat = (color: string, opacity = 1): MeshBasicMaterial =>
  new MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
const additive = (color: string, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
const steel = (color: string, metalness = 0.6, roughness = 0.45): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, metalness, roughness });

const tmp = new Vector3(), tan = new Vector3(), side = new Vector3(), col = new Color();
const lifted = (v: Vector3, y: number): Vector3 => v.clone().setY(v.y + y);

// 1. Conduit grid — the district-link pipe scaled up to road size: a dark pipe
// on risers, twin brass rails, a lit core with pulses running out of town, and
// octagonal junction boxes where links meet.
const conduit = (c: Ctx): ConceptScene => {
  const H = 0.14;
  const cyl = new CylinderGeometry(1, 1, 1, 6), oct = new CylinderGeometry(1, 1, 1, 8);
  const body = batch(c.scene, cyl, steel("#32353b"), 256), rail = batch(c.scene, cyl, steel("#bc9653", 0.7), 512);
  const core = batch(c.scene, cyl, glowMat("#ffffff"), 256, true), box = batch(c.scene, oct, steel("#2a2d33"), 64);
  const boxLight = batch(c.scene, oct, glowMat("#ffe0a0"), 64);
  const cores: Array<{ index: number; s: number }> = [];
  for (const path of c.paths) {
    for (let i = 1; i < path.pts.length; i += 1) {
      const a = lifted(path.pts[i - 1]!, H), b = lifted(path.pts[i]!, H);
      body.between(a, b, 0.048);
      side.subVectors(b, a).setY(0).normalize();
      const off = new Vector3(-side.z * 0.08, 0.022, side.x * 0.08);
      rail.between(a.clone().add(off), b.clone().add(off), 0.013);
      off.x *= -1; off.z *= -1;
      rail.between(a.clone().add(off), b.clone().add(off), 0.013);
      cores.push({ index: core.between(lifted(a, 0.042), lifted(b, 0.042), 0.013), s: path.cum[i - 1]! });
    }
  }
  for (const pt of uniquePoints(c.paths)) body.between(pt, lifted(pt, H), 0.036);
  for (const hub of c.hubs) {
    box.at(lifted(hub, H), 0.12, 0.1, 0.12);
    boxLight.at(lifted(hub, H + 0.052), 0.07, 0.008, 0.07);
  }
  for (const b of [body, rail, core, box, boxLight]) b.done();
  c.own(cyl); c.own(oct);
  return {
    update: (t) => {
      for (const { index, s } of cores) {
        const pulse = Math.pow(0.5 + 0.5 * Math.sin(s * 5.5 - t * 3.5), 6);
        core.mesh.setColorAt(index, col.set("#c6a871").lerp(new Color("#fff6d8"), pulse));
      }
      if (core.mesh.instanceColor) core.mesh.instanceColor.needsUpdate = true;
    },
    dispose: () => [body, rail, core, box, boxLight].forEach(disposeBatch(c.scene))
  };
};

// 2. Monorail — slim pylons with a rail strung between their heads; lit pods
// glide along it. Height makes the network readable from far out.
const monorail = (c: Ctx): ConceptScene => {
  const H = 0.42;
  const taper = new CylinderGeometry(0.5, 1, 1, 6), cyl = new CylinderGeometry(1, 1, 1, 6);
  const cube = new BoxGeometry(1, 1, 1), disc = new CircleGeometry(1, 16).rotateX(-Math.PI / 2);
  const pylon = batch(c.scene, taper, steel("#4a5058"), 128), beam = batch(c.scene, cyl, steel("#8a929c", 0.8, 0.3), 256);
  const head = batch(c.scene, cube, steel("#3a3f46"), 128), shadow = batch(c.scene, disc, glowMat("#000000", 0.25), 128);
  const pod = batch(c.scene, cube, steel("#d8dde3", 0.5, 0.35), 64), podLight = batch(c.scene, cube, glowMat("#7fe8ff"), 64);
  for (const pt of uniquePoints(c.paths)) {
    pylon.between(pt, lifted(pt, H), 0.034);
    head.at(lifted(pt, H), 0.1, 0.03, 0.1);
    shadow.at(lifted(pt, 0.004), 0.09, 1, 0.09);
  }
  for (const path of c.paths) for (let i = 1; i < path.pts.length; i += 1) beam.between(lifted(path.pts[i - 1]!, H + 0.012), lifted(path.pts[i]!, H + 0.02), 0.02);
  for (const b of [pylon, beam, head, shadow]) b.done();
  const pods = c.paths.flatMap((path, pi) => [0, 0.34, 0.67].map((phase) => ({ path, phase: phase + pi * 0.21 })));
  c.own(taper); c.own(cyl); c.own(cube); c.own(disc);
  return {
    update: (t) => {
      pod.cursor = 0; podLight.cursor = 0;
      for (const { path, phase } of pods) {
        const u = ((t * 0.12 + phase) % 1 + 1) % 1;
        const back = Math.floor(t * 0.12 + phase) % 2 === 1;
        pointAt(path, (back ? 1 - u : u) * path.length, tmp, tan);
        pod.at(lifted(tmp, H + 0.065), 0.17, 0.055, 0.065, tan);
        podLight.at(lifted(tmp, H + 0.068), 0.174, 0.014, 0.068, tan);
      }
      pod.done(); podLight.done();
    },
    dispose: () => [pylon, beam, head, shadow, pod, podLight].forEach(disposeBatch(c.scene))
  };
};

// 3. Traffic only — no road surface at all. The link is the stream of small
// hover craft running both ways, each dragging a light trail, over a faint
// line of guidance studs.
const traffic = (c: Ctx): ConceptScene => {
  const craftGeo = new OctahedronGeometry(1, 0), cube = new BoxGeometry(1, 1, 1);
  const disc = new CircleGeometry(1, 10).rotateX(-Math.PI / 2);
  const craft = batch(c.scene, craftGeo, glowMat("#e9fbff"), 256);
  const trail = batch(c.scene, cube, additive("#38c8ff", 0.65), 256);
  const stud = batch(c.scene, disc, glowMat("#1d6f8a", 0.7), 512);
  for (const path of c.paths) for (let s = 0; s < path.length; s += 0.18) stud.at(lifted(pointAt(path, s, tmp), 0.004), 0.022, 1, 0.022);
  stud.done();
  const movers = c.paths.flatMap((path) => {
    const n = Math.max(2, Math.round(path.length * 2.2));
    return Array.from({ length: n * 2 }, (_, i) => ({ path, dir: i % 2 === 0 ? 1 : -1, phase: (i * 0.618) % 1, speed: 0.55 + ((i * 0.37) % 0.3) }));
  });
  c.own(craftGeo); c.own(cube); c.own(disc);
  return {
    update: (t) => {
      craft.cursor = 0; trail.cursor = 0;
      for (const mv of movers) {
        const s = (((t * mv.speed) / mv.path.length + mv.phase) % 1) * mv.path.length;
        const along = mv.dir > 0 ? s : mv.path.length - s;
        pointAt(mv.path, along, tmp, tan);
        if (mv.dir < 0) tan.negate();
        side.set(-tan.z, 0, tan.x).multiplyScalar(0.06 * mv.dir);
        const pos = lifted(tmp, 0.075 + Math.sin(t * 3 + mv.phase * 20) * 0.006).add(side);
        craft.at(pos, 0.065, 0.024, 0.038, tan);
        trail.at(pos.clone().addScaledVector(tan, -0.15), 0.26, 0.01, 0.022, tan);
      }
      craft.done(); trail.done();
    },
    dispose: () => [craft, trail, stud].forEach(disposeBatch(c.scene))
  };
};

// 4. Beacon line — two rows of small light posts, like runway edge lights,
// with a light chasing outward from each town. Sparse: the ground stays clean.
const beacons = (c: Ctx): ConceptScene => {
  const cyl = new CylinderGeometry(1, 1, 1, 6);
  const post = batch(c.scene, cyl, steel("#2c3036"), 1024), cap = batch(c.scene, cyl, glowMat("#ffffff"), 1024, true);
  const caps: Array<{ index: number; s: number }> = [];
  const place = (pt: Vector3, s: number): void => {
    post.between(pt, lifted(pt, 0.075), 0.015);
    caps.push({ index: cap.between(lifted(pt, 0.075), lifted(pt, 0.095), 0.024), s });
  };
  for (const path of c.paths) {
    for (let s = 0.12; s < path.length - 0.05; s += 0.2) {
      pointAt(path, s, tmp, tan);
      side.set(-tan.z, 0, tan.x).multiplyScalar(0.11);
      place(tmp.clone().add(side), s);
      place(tmp.clone().sub(side), s);
    }
  }
  for (const hub of c.hubs) for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    place(hub.clone().add(new Vector3(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18)), -1);
  }
  post.done(); cap.done();
  c.own(cyl);
  return {
    update: (t) => {
      for (const { index, s } of caps) {
        const k = s < 0 ? 0.5 + 0.5 * Math.sin(t * 2) : Math.pow(((s * 1.6 - t * 1.4) % 1 + 1) % 1, 5);
        cap.mesh.setColorAt(index, col.set("#2a6f80").lerp(new Color("#c8fbff"), k));
      }
      if (cap.mesh.instanceColor) cap.mesh.instanceColor.needsUpdate = true;
    },
    dispose: () => [post, cap].forEach(disposeBatch(c.scene))
  };
};

// 5. Relay crystals — a hovering, slowly turning crystal over each road tile,
// tethered to the next by a thin light beam, with a faint ring on the ground.
const relays = (c: Ctx): ConceptScene => {
  const H = 0.3;
  const crystalGeo = new OctahedronGeometry(1, 0), cyl = new CylinderGeometry(1, 1, 1, 6);
  const ring = new CylinderGeometry(1, 1, 0.001, 24, 1, true);
  const crystal = batch(c.scene, crystalGeo, new MeshStandardMaterial({ color: "#9fe9ff", emissive: "#2aa9d6", emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.15 }), 128);
  const beam = batch(c.scene, cyl, glowMat("#b8f4ff"), 256), halo = batch(c.scene, cyl, additive("#2fb8e8", 0.3), 256);
  const ground = batch(c.scene, ring, glowMat("#2fb8e8", 0.35), 128);
  const pts = uniquePoints(c.paths);
  c.own(crystalGeo); c.own(cyl); c.own(ring);
  const bob = (pt: Vector3, t: number): Vector3 => lifted(pt, H + Math.sin(t * 1.6 + pt.x * 2.1 + pt.z * 1.3) * 0.018);
  for (const pt of pts) ground.at(lifted(pt, 0.004), 0.1, 1, 0.1);
  ground.done();
  return {
    update: (t) => {
      crystal.cursor = 0; beam.cursor = 0; halo.cursor = 0;
      for (const pt of pts) crystal.at(bob(pt, t), 0.085, 0.16, 0.085, tan.set(Math.cos(t + pt.x), 0, Math.sin(t + pt.x)));
      for (const path of c.paths) for (let i = 1; i < path.pts.length; i += 1) {
        const a = bob(path.pts[i - 1]!, t), b = bob(path.pts[i]!, t);
        beam.between(a, b, 0.009);
        halo.between(a, b, 0.032);
      }
      for (const b of [crystal, beam, halo]) b.done();
    },
    dispose: () => [crystal, beam, halo, ground].forEach(disposeBatch(c.scene))
  };
};

const disposeBatch = (scene: Scene) => (b: Batch): void => {
  scene.remove(b.mesh);
  b.mesh.dispose();
  (b.mesh.material as Material).dispose();
};

const BUILDERS: Record<RoadConcept, (c: Ctx) => ConceptScene> = { conduit, monorail, traffic, beacons, relays };

export const buildRoadConcept = (scene: Scene, concept: RoadConcept, paths: readonly ConceptPath[], hubs: readonly Vector3[]): ConceptScene => {
  const owned: Array<BufferGeometry | Material> = [];
  const built = BUILDERS[concept]({ scene, paths, hubs, own: (g) => owned.push(g) });
  return { update: built.update, dispose: () => { built.dispose(); owned.forEach((g) => g.dispose()); } };
};
