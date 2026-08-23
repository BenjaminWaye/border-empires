import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Points, PointsMaterial, Scene } from "three";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";

// Ambient dust drifting through the pale beam at a border-contact seam
// (see client-reach-overlay-border-contact.ts's doc comment for what a
// "contact seam" is). Deliberately NOT the travelling-pulse effect this
// codebase already tried and removed from the border lines themselves
// (client-map-3d-aether-survey-line.ts: "No travelling pulse -- removed per
// review, it read as distracting bubbles rather than a subtle detail") --
// this is the opposite shape of effect on purpose: many tiny, slow,
// low-opacity motes with independent per-particle phase (no shared
// synchronized pulse to read as a "blob"), colored half-and-half in each
// side's owner color so red/green empires read as red dust and green dust
// mingling through the shared beam, rather than one more colored line.

const PARTICLES_PER_SEAM = 8; // sparse by design -- see doc comment above
const MAX_SEAMS = 24; // bounds pool size; extra seams beyond this just aren't seeded this frame
const MAX_PARTICLES = PARTICLES_PER_SEAM * MAX_SEAMS;
const PARTICLE_SIZE = 0.045; // "tiny" per the brief -- a fraction of the pylon's own scale
const PARTICLE_OPACITY = 0.55;
const DRIFT_PERIOD_MS = 9_000; // one slow pass along the seam and back
const BOB_AMPLITUDE = 0.05; // small perpendicular/vertical wander, not a straight line
const BOB_PERIOD_MS = 3_400;

export type BorderDustSeam = {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
  readonly colorA: string;
  readonly colorB: string;
};

export type BorderDustFxLayer = {
  readonly group: Group;
  /** Replace the current set of seeded seams. Call from the same throttled rebuild that recomputes border-contact seams. */
  readonly setSeams: (seams: readonly BorderDustSeam[]) => void;
  /** Advances particle drift. Call every frame, independent of the rebuild throttle -- same convention as every other animated overlay. */
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

type ParticleSlot = {
  seamIndex: number;
  side: 0 | 1; // which end's color this mote carries
  phase: number; // per-particle offset so motes don't move in lockstep
};

export const createBorderDustFxLayer = (scene: Scene): BorderDustFxLayer => {
  const group = new Group();
  group.name = "border-dust-fx";

  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  const material = new PointsMaterial({
    size: PARTICLE_SIZE,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: PARTICLE_OPACITY,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;
  group.add(points);
  scene.add(group);

  let seams: readonly BorderDustSeam[] = [];
  let slots: ParticleSlot[] = [];
  const colorA = new Color();
  const colorB = new Color();

  const setSeams = (nextSeams: readonly BorderDustSeam[]): void => {
    seams = nextSeams.slice(0, MAX_SEAMS);
    slots = [];
    for (let s = 0; s < seams.length; s += 1) {
      for (let p = 0; p < PARTICLES_PER_SEAM; p += 1) {
        slots.push({ seamIndex: s, side: p % 2 === 0 ? 0 : 1, phase: (s * PARTICLES_PER_SEAM + p) * 0.6180339887 });
      }
    }
    points.visible = slots.length > 0;
  };

  const update = (nowMs: number): void => {
    if (slots.length === 0) return;
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!;
      const seam = seams[slot.seamIndex];
      if (!seam) continue;
      // Slow back-and-forth drift along the seam (0..1..0), phase-offset per
      // particle so the whole seam doesn't pulse as one unit.
      const driftT = (Math.sin((nowMs / DRIFT_PERIOD_MS) * Math.PI * 2 + slot.phase) + 1) / 2;
      const bx = seam.x0 + (seam.x1 - seam.x0) * driftT;
      const by = seam.y0 + (seam.y1 - seam.y0) * driftT;
      const bz = seam.z0 + (seam.z1 - seam.z0) * driftT;
      // Small independent wander off the line itself -- reads as "floating
      // dust", not "riding a rail".
      const bob = Math.sin(nowMs / BOB_PERIOD_MS + slot.phase * 3.1) * BOB_AMPLITUDE;
      const wobble = Math.cos(nowMs / (BOB_PERIOD_MS * 0.7) + slot.phase * 5.7) * BOB_AMPLITUDE;

      positions[i * 3] = bx + wobble;
      positions[i * 3 + 1] = by + bob;
      positions[i * 3 + 2] = bz;

      const c = slot.side === 0 ? colorA.set(normalizeColorForThree(seam.colorA)) : colorB.set(normalizeColorForThree(seam.colorB));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
    geometry.setDrawRange(0, slots.length);
  };

  const dispose = (): void => {
    scene.remove(group);
    geometry.dispose();
    material.dispose();
  };

  return { group, setSeams, update, dispose };
};
