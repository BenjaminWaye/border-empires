// Real starfield: an instanced Points cloud (not a CSS gradient), plus a
// large inward-facing sphere "nebula" skybox for backdrop atmosphere. Mirrors
// the disposal discipline used by client-map-3d's overlay factories — every
// caller of `createStarfield` must call `.dispose()` when the scene tears
// down.
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry
} from "three";

export type Starfield = {
  group: Group;
  dispose: () => void;
};

const STAR_COUNT = 4000;
const STARFIELD_RADIUS = 900;
const NEBULA_RADIUS = 950;

/** Deterministic PRNG (mulberry32) so the starfield layout is stable across mounts. */
const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const createStarfield = (): Starfield => {
  const group = new Group();
  const rand = mulberry32(0x5eed);

  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Uniform-on-sphere-shell sampling with a randomized radius band so the
    // field reads as volumetric depth rather than a flat sphere shell.
    const theta = Math.acos(rand() * 2 - 1);
    const phi = rand() * Math.PI * 2;
    const radius = STARFIELD_RADIUS * (0.25 + rand() * 0.75);
    positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
    positions[i * 3 + 1] = radius * Math.cos(theta);
    positions[i * 3 + 2] = radius * Math.sin(theta) * Math.sin(phi);

    // Slight blue/white tint variance for visual richness.
    const tint = 0.75 + rand() * 0.25;
    colors[i * 3] = tint;
    colors[i * 3 + 1] = tint;
    colors[i * 3 + 2] = 1;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  const material = new PointsMaterial({
    size: 1.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: true
  });

  const points = new Points(geometry, material);
  group.add(points);

  // Nebula backdrop: a large inward-facing sphere with a soft radial-ish
  // gradient baked via vertex colors, cheap enough to run everywhere.
  const nebulaGeometry = new SphereGeometry(NEBULA_RADIUS, 24, 16);
  const nebulaColorAttr = nebulaGeometry.getAttribute("position");
  const nebulaColors = new Float32Array(nebulaColorAttr.count * 3);
  const paletteA = new Color(0x1b0f3a);
  const paletteB = new Color(0x030712);
  for (let i = 0; i < nebulaColorAttr.count; i++) {
    const y = nebulaColorAttr.getY(i) / NEBULA_RADIUS; // -1..1
    const mixed = paletteA.clone().lerp(paletteB, (y + 1) / 2);
    nebulaColors[i * 3] = mixed.r;
    nebulaColors[i * 3 + 1] = mixed.g;
    nebulaColors[i * 3 + 2] = mixed.b;
  }
  nebulaGeometry.setAttribute("color", new BufferAttribute(nebulaColors, 3));
  const nebulaMaterial = new MeshBasicMaterial({
    toneMapped: false,
    vertexColors: true,
    side: BackSide,
    fog: false,
    depthWrite: false
  });
  const nebula = new Mesh(nebulaGeometry, nebulaMaterial);
  group.add(nebula);

  return {
    group,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      nebulaGeometry.dispose();
      nebulaMaterial.dispose();
    }
  };
};
