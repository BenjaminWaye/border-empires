// The part catalogue for the Umbrite Synthesis (UMB) module: every geometry and
// material the module is built from, plus the profile constants the placement
// code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the synthesiser is made of,
// and the module file only decides where each piece sits. It is also the only
// place that needs to change when a piece's proportions move.
//
// The Umbrite core is the reason this family is built around a horizontal
// barrel rather than an upright one: it wants to be read as a length of dense
// material under pressure, so it runs across the pod's shoulders instead of
// stacking on top of them.

import { BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with, squashed
// only far enough to give the horizontal chamber somewhere to sit.
export const UMB_POD = { y: 0.082, squash: 0.78, radius: 0.075 };
export const UMB_POD_CROWN = UMB_POD.y + (UMB_POD.radius + 0.01) * UMB_POD.squash;
// Chamber: the dominant mechanism, lying across the pod on the Z axis with its
// centre sunk so its lower half passes through the pod's crown. Its 0.145
// length plus the injectors either side is what sets the family's width.
export const UMB_CHAMBER = { radius: 0.05, length: 0.138, y: 0.14, ringZ: 0.048 };
// Umbrite: the dense violet-black core suspended inside the barrel, a little
// shorter than the shell so the vessel's end walls stay closed.
export const UMB_CORE = { radius: 0.036, length: 0.126 };
// Injectors: two compact cylinders coaxial with the barrel, one at each end,
// feeding material inward.
export const UMB_INJECTOR = { radius: 0.02, length: 0.026, z: 0.082 };
// Pressure_Control: a stout manifold standing on the barrel's crown, carrying a
// brass-bezelled dial on its forward face.
export const UMB_MANIFOLD = { y: UMB_CHAMBER.y + UMB_CHAMBER.radius + 0.013, radius: 0.024, height: 0.026 };
export const UMB_GAUGE = { radius: 0.026, tube: 0.006, x: 0.03, faceX: 0.032 };
// Feed_Pipes: two short braced runs lifting material from the pod up into the
// barrel's underside.
export const UMB_PIPE = { radius: 0.008, z: 0.038, flangeTube: 0.0045 };

export type UmbriteSynthesisMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  readonly pipe: MeshStandardMaterial;
  // The chamber's thick pressure window: dark and translucent, so the core
  // inside reads as a mass suspended in glass rather than a painted stripe.
  readonly window: MeshStandardMaterial;
  // The Umbrite itself — near-black violet, only faintly self-lit. It must
  // never read as a lamp: at strategy distance it has to look heavy.
  readonly umbrite: MeshStandardMaterial;
  // Subtle purple accents only: the injectors' inner rings and the dial face.
  readonly violet: MeshStandardMaterial;
};

export type UmbriteSynthesisGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly window: BufferGeometry;
  readonly umbrite: BufferGeometry;
  readonly chamberRing: BufferGeometry;
  readonly injector: BufferGeometry;
  readonly injectorCap: BufferGeometry;
  readonly injectorRing: BufferGeometry;
  readonly manifold: BufferGeometry;
  readonly manifoldCap: BufferGeometry;
  readonly gaugeBezel: BufferGeometry;
  readonly gaugeFace: BufferGeometry;
  readonly gaugeNeedle: BufferGeometry;
  readonly pipe: BufferGeometry;
  readonly pipeFlange: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type UmbriteSynthesisParts = {
  readonly geometries: UmbriteSynthesisGeometries;
  readonly materials: UmbriteSynthesisMaterials;
};

export const createUmbriteSynthesisParts = (): UmbriteSynthesisParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const pipe = new MeshStandardMaterial({ color: "#2c2f36", roughness: 0.55, metalness: 0.6, flatShading: true });
  // The barrel's shell. Opaque-looking but genuinely translucent, so the core
  // shows through it and the flat-shaded facets read as a thick pressure window.
  const window = new MeshStandardMaterial({
    color: "#1b1522",
    roughness: 0.35,
    metalness: 0.2,
    flatShading: true,
    transparent: true,
    opacity: 0.42,
    emissive: "#170f28",
    emissiveIntensity: 0.5
  });
  // Dense, dark, slightly wrong-looking violet-black.
  const umbrite = new MeshStandardMaterial({
    color: "#150d21",
    roughness: 0.25,
    metalness: 0.15,
    flatShading: true,
    emissive: "#3d1f6b",
    emissiveIntensity: 0.35
  });
  // The only real light in the module, and it is a low, contained purple.
  const violet = new MeshStandardMaterial({
    color: "#1b1030",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#6a3fd0",
    emissiveIntensity: 1.6
  });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, pipe, window, umbrite, violet },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(UMB_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // Chamber: shell, core, and the heavy compression rings that clamp them.
      window: new CylinderGeometry(UMB_CHAMBER.radius, UMB_CHAMBER.radius, UMB_CHAMBER.length, 16),
      umbrite: new CylinderGeometry(UMB_CORE.radius, UMB_CORE.radius, UMB_CORE.length, 14),
      chamberRing: new TorusGeometry(UMB_CHAMBER.radius + 0.002, 0.012, 10, 24),
      // Injectors: body, brass end cap, and the inner ring where material
      // enters the barrel.
      injector: new CylinderGeometry(UMB_INJECTOR.radius, UMB_INJECTOR.radius, UMB_INJECTOR.length, 12),
      injectorCap: new TorusGeometry(UMB_INJECTOR.radius + 0.002, 0.0045, 8, 18),
      injectorRing: new TorusGeometry(0.016, 0.0035, 8, 18),
      // Pressure_Control: manifold, cap, dial bezel, face and needle.
      manifold: new CylinderGeometry(UMB_MANIFOLD.radius, UMB_MANIFOLD.radius + 0.004, UMB_MANIFOLD.height, 10),
      manifoldCap: new TorusGeometry(UMB_MANIFOLD.radius + 0.001, 0.005, 8, 18),
      gaugeBezel: new TorusGeometry(UMB_GAUGE.radius, UMB_GAUGE.tube, 8, 20),
      gaugeFace: new CylinderGeometry(0.022, 0.022, 0.006, 14),
      gaugeNeedle: new CylinderGeometry(0.002, 0.002, 0.018, 6),
      // Feed_Pipes: heavy short runs with a brass flange at the barrel.
      pipe: new CylinderGeometry(UMB_PIPE.radius, UMB_PIPE.radius, 1, 8),
      pipeFlange: new TorusGeometry(UMB_PIPE.radius + 0.004, UMB_PIPE.flangeTube, 8, 16),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};
