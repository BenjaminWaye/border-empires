// The part catalogue for the Neural Assembly Core (NAC) module: every geometry
// and material the module is built from, plus the profile constants the
// placement code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the neural assembler is made
// of, and the module file only decides where each piece sits. It is also the
// only place that needs to change when a piece's proportions move.
//
// MAIN_READ: the whole point of this family is one large exposed spherical
// neural core SUSPENDED inside a brass gimbal frame above the pod — a dark
// smoky-glass sphere crossed by a few broad glowing cyan pathways that read as
// artificial neural activity, cradled by two crossed brass hoops (the gimbal),
// with four thick articulated conductor arms rising from a compact processor
// housing to seat in the gimbal and reach contact prongs toward the core, as if
// the AFC is writing and calibrating neural patterns into it. The module
// fabricates and coordinates advanced neural-control systems for automated
// industry and manpower infrastructure: it is a machine-intelligence workbench,
// never a power reactor or a computer terminal, so the glow is a restrained
// cyan pathway-light, not a bright core.
//
// Strong readable silhouette from strategy-game camera distance, in the shared
// materials of the ring: blackened iron, dark steel, aged brass and the
// family's restrained cyan neural accent.
//
// Local axes (shared with every AFC family): +X is FORWARD — the socket's
// outward radial direction — and the rear coupling hangs at -X. The gimbal and
// sphere sit centred on the pod, with the four conductor arms at the cardinal
// azimuths around the vertical.

import { BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with, so the
// neural head stands on the shared blackened body rather than a variant one.
export const NAC_POD = { y: 0.082, squash: 0.74, radius: 0.075 };
export const NAC_POD_CROWN = NAC_POD.y + (NAC_POD.radius + 0.01) * NAC_POD.squash;
// Housing: the compact lower processor housing mounted on the pod crown — the
// neural circuitry the arms, gimbal and conduits all return to. It reads as a
// stocky control block under the floated sphere.
export const NAC_HOUSING = { radius: 0.045, length: 0.055, y: 0.14 };
// The Suspended_Sphere: the large exposed neural core — a dark smoky-glass
// sphere floating inside the gimbal above the housing. Suspended means its
// whole volume clears the pod crown, with only the thin post and the conductor
// arms carrying it.
export const NAC_GLASS = { radius: 0.039, y: 0.192 };
// Pathways: the broad glowing cyan rings crossed over the sphere's surface —
// two latitude rings and one meridian ring, reading as neural pathways running
// across the dark core rather than a bright uniform power-plant glow. They sit
// just proud of the sphere surface, inside the gimbal.
export const NAC_PATHWAY = { radius: 0.0405, tube: 0.0022 };
export const NAC_PATHWAY_LATITUDE_LIFT = 0.014;
// Gimbal: the brass mounting frame the sphere is cradled in — two crossed
// vertical hoops through the sphere's centre (one in the forward plane, one in
// the cross plane), the aged-brass reinforcement of the whole ring. The inner
// hoop clears the sphere and its pathways: 0.039 + 0.0022 < 0.048.
export const NAC_GIMBAL = { outerRadius: 0.052, innerRadius: 0.048, tube: 0.004 };
// The thin suspension column rising from the processor housing to the sphere.
export const NAC_POST = { radius: 0.0075 };
// Conductor_Arms: four thick articulated arms at the cardinal azimuths. Each
// rises from a shoulder joint on the housing flank, runs up-and-out through an
// elbow that seats exactly ON the gimbal's outer hoop, and ends in a short
// contact prong reaching back inward toward the sphere, just clear of its
// surface — four probes as if writing neural patterns into the core. Their
// elbows sit at radial 0.064 local (0.085 world), setting this family's width.
export const NAC_ARM = {
  shoulderR: 0.048,
  shoulderY: 0.155,
  shoulderRadius: 0.0075,
  upperR: 0.008,
  upperOut: 0.056,
  upperY: 0.19,
  elbowRadius: 0.008,
  prongR: 0.006,
  prongTip: 0.041
} as const;
export const NAC_ARM_AZIMUTHS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;
// Data/Power_Conduits: two heavy runs feeding the neural housing back into the
// AFC low on the rear, either side of the coupling.
export const NAC_CONDUIT = {
  radius: 0.009,
  z: 0.035,
  foot: { x: -0.055, y: 0.098 },
  top: { x: 0.02, y: 0.15 }
} as const;
// The module's tallest point: the peak of the gimbal's outer hoop where it
// crosses the vertical axis above the sphere, 0.248 local = 0.3298 world, under
// the 0.34 ceiling.
export const NAC_TOWER_TOP = NAC_GLASS.y + NAC_GIMBAL.outerRadius + NAC_GIMBAL.tube;

export type NeuralAssemblyCoreMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  readonly pipe: MeshStandardMaterial;
  // The family's restrained neural accent: the glowing cyan pathways crossing
  // the dark core and the rear coupling's contact tip. Moderate enough to read
  // as an active neural assembler on the map, never bright enough to outshine
  // the metals and read as a power reactor.
  readonly cyan: MeshStandardMaterial;
  // The dark smoky-glass sphere of the neural core itself.
  readonly smokyGlass: MeshStandardMaterial;
};

export type NeuralAssemblyCoreGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly housing: BufferGeometry;
  readonly housingBand: BufferGeometry;
  readonly post: BufferGeometry;
  readonly glass: BufferGeometry;
  readonly pathway: BufferGeometry;
  readonly gimbalOuter: BufferGeometry;
  readonly gimbalInner: BufferGeometry;
  readonly shoulder: BufferGeometry;
  readonly upperArm: BufferGeometry;
  readonly elbow: BufferGeometry;
  readonly prong: BufferGeometry;
  readonly conduit: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type NeuralAssemblyCoreParts = {
  readonly geometries: NeuralAssemblyCoreGeometries;
  readonly materials: NeuralAssemblyCoreMaterials;
};

export const createNeuralAssemblyCoreParts = (): NeuralAssemblyCoreParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const pipe = new MeshStandardMaterial({ color: "#2c2f36", roughness: 0.55, metalness: 0.6, flatShading: true });
  const cyan = new MeshStandardMaterial({
    color: "#0d2430",
    roughness: 0.32,
    metalness: 0.15,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 1.1
  });
  const smokyGlass = new MeshStandardMaterial({ color: "#1c1d22", roughness: 0.35, metalness: 0.6, flatShading: true });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, pipe, cyan, smokyGlass },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(NAC_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // The neural head: the compact processor housing, its brass band, the
      // thin suspension post, the dark sphere, its cyan pathway rings, and the
      // two crossed brass gimbal hoops.
      housing: new CylinderGeometry(NAC_HOUSING.radius, NAC_HOUSING.radius, 1, 16),
      housingBand: new TorusGeometry(NAC_HOUSING.radius + 0.004, 0.0065, 10, 18),
      post: new CylinderGeometry(NAC_POST.radius, NAC_POST.radius, 1, 8),
      glass: new SphereGeometry(NAC_GLASS.radius, 14, 12),
      pathway: new TorusGeometry(NAC_PATHWAY.radius, NAC_PATHWAY.tube, 6, 24),
      gimbalOuter: new TorusGeometry(NAC_GIMBAL.outerRadius, NAC_GIMBAL.tube, 8, 24),
      gimbalInner: new TorusGeometry(NAC_GIMBAL.innerRadius, NAC_GIMBAL.tube, 8, 24),
      // The four conductor arms: shoulder joints, upper runs, gimbal-seated
      // elbows and inward-reaching contact prongs.
      shoulder: new SphereGeometry(NAC_ARM.shoulderRadius, 8, 6),
      upperArm: new CylinderGeometry(NAC_ARM.upperR, NAC_ARM.upperR, 1, 8),
      elbow: new SphereGeometry(NAC_ARM.elbowRadius, 8, 6),
      prong: new CylinderGeometry(NAC_ARM.prongR, NAC_ARM.prongR, 1, 8),
      // The heavy data/power runs low on the rear.
      conduit: new CylinderGeometry(NAC_CONDUIT.radius, NAC_CONDUIT.radius, 1, 8),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};