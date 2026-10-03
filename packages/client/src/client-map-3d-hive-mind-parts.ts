// The part catalogue for the Hive Mind (HMM) module: every geometry and material
// the module is built from, plus the profile constants the placement code builds
// against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the hive mind is made of, and
// the module file only decides where each piece sits. It is also the only place
// that needs to change when a piece's proportions move.
//
// MAIN_READ: this module is a distributed military command network for the
// settlement — a coordinator, deliberately NOT a brain, a power plant or a
// sensor dish. One large dark command node orbits above the pod as a faceted
// metallic sphere, held in a heavy three-claw brass support frame. Three relay
// nodes stand evenly around it at 120°, each piped into the orb by a thick rigid
// conduit, so the orb reads as receiving battlefield information from multiple
// sources and radiating command back outward through the same lines. A slim
// brass scan ring precesses slowly around the orb — the small rotating sensor
// — and three restrained cyan signal lights mark the relays' outward faces.
// Everything mechanical is heavy, dark and low-poly: blackened iron pod, dark
// steel orb and conduits, aged brass support frame and scan ring, with a
// restrained cyan command-signal glow and no antennas or tiny electronics.
//
// Strong readable silhouette from strategy-game camera distance — rounded pod +
// large central command sphere + three surrounding relay nodes with their signal
// lights — in the shared materials of the ring: blackened iron, dark steel,
// aged brass, and a restrained cyan command-signal glow.
//
// Local axes (shared with every AFC family): +X is FORWARD — the socket's
// outward radial direction — and the rear coupling hangs at -X. The command
// node stands on the module's own centre line; the three relays orbit it at
// 120° azimuths.

import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with.
export const HMM_POD = { y: 0.082, squash: 0.74, radius: 0.075 };
export const HMM_POD_CROWN = HMM_POD.y + (HMM_POD.radius + 0.01) * HMM_POD.squash;
// Command_Node: one large low-poly faceted orb mounted above the pod — the
// network's centre. Its top is the module's tallest point.
export const HMM_CORE = { r: 0.045, y: 0.209 };
// Support_Frame: the heavy brass frame that holds the orb — three thick claw
// arcs gripping the sphere at 120° azimuths, OUTSIDE the scan ring so nothing
// collides as the ring sweeps.
export const HMM_CRADLE = { radius: 0.07, tube: 0.01, arc: 0.6 };
export const HMM_CRADLE_AZIMUTHS = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
// Sensor_Ring: the small rotating brass ring around the orb — a slim torus that
// precesses about the module's vertical axis inside the claw frame, between the
// orb (0.045) and the claws (inner edge 0.06). The tilt keeps its crown well
// below the orb's own crown (0.247), so the orb stays the tallest point.
export const HMM_SENSOR_RING = { radius: 0.053, tube: 0.0035, y: HMM_CORE.y, tilt: 0.55 };
export const HMM_SENSOR_RING_START_ROLL = 0.25;
// Slow steady scan: 0.0005 rad per ms is one full sweep every ~12.5s — a
// commander's gaze, never a frantic spin.
export const HMM_SENSOR_RING_SPEED_MS = 0.0005;
// Relays: three secondary nodes evenly spaced around the orb. They ride on a
// lower ring (below the orbital plane of the claws) with their outer faces
// carrying the outward signal lights.
export const HMM_RELAY = { r: 0.014, radius: 0.082, y: 0.182 };
export const HMM_RELAY_AZIMUTHS = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
// Conduits: the thick rigid lines piping each relay into the orb — a slab
// spanning from the orb's surface at the relay's height to the relay's inner
// face.
export const HMM_CONDUIT = { thickness: 0.011, len: 0.032, radius: 0.052, y: HMM_RELAY.y };
// Signal_Lights: the restrained cyan command signals, proud of each relay's
// outward face. Their outer faces set the module's width — under the AFC bay
// limit.
export const HMM_SIGNAL_LIGHT = { size: 0.006, radius: 0.099, y: HMM_RELAY.y };
// The faceted command orb sits in the shared low-poly icosahedron orientation,
// whose highest vertex rises only t/√(1+t²) of the sphere's radius above its
// centre — so the orb's true crown is below the raw radius by that factor. This
// is the couplet that keeps every height assertion honest: the published height
// is the REAL crown, not the idealised circumsphere.
export const HMM_ORB_POLE = 0.85065080835204;
// The module's tallest point: the command orb's crown, 0.2473 local = 0.3289
// world, under the 0.34 ceiling.
export const HMM_TOWER_TOP = HMM_CORE.y + HMM_CORE.r * HMM_ORB_POLE;

export type HiveMindMaterials = {
  readonly iron: MeshStandardMaterial;
  // The dark steel of the command orb and its conduits — distinctly darker than
  // the blackened iron body so the node and its armed lines read as one system.
  readonly steel: MeshStandardMaterial;
  // The aged brass support frame, scanning ring and trim.
  readonly brass: MeshStandardMaterial;
  // The restrained cyan command-signal glow on the relays plus the cyan AFC
  // contact tip on the rear coupling.
  readonly cyan: MeshStandardMaterial;
};

export type HiveMindGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly core: BufferGeometry;
  readonly claw: BufferGeometry;
  readonly sensorRing: BufferGeometry;
  readonly relay: BufferGeometry;
  readonly conduit: BufferGeometry;
  readonly light: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type HiveMindParts = {
  readonly geometries: HiveMindGeometries;
  readonly materials: HiveMindMaterials;
};

export const createHiveMindParts = (): HiveMindParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const cyan = new MeshStandardMaterial({
    color: "#0d2430",
    roughness: 0.32,
    metalness: 0.15,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 1.0
  });

  // The command orb is a faceted low-poly ball — 20 flat triangles read as a
  // heavy machined sphere at strategy-game distance, and the brass claws hold it
  // from outside.
  const claw = new TorusGeometry(HMM_CRADLE.radius, HMM_CRADLE.tube, 8, 18, HMM_CRADLE.arc);
  claw.rotateZ(-HMM_CRADLE.arc / 2);
  const sensorRing = new TorusGeometry(HMM_SENSOR_RING.radius, HMM_SENSOR_RING.tube, 8, 24);

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, cyan },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(HMM_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      core: new IcosahedronGeometry(HMM_CORE.r, 0),
      claw,
      sensorRing,
      relay: new IcosahedronGeometry(HMM_RELAY.r, 0),
      conduit: new BoxGeometry(HMM_CONDUIT.len, HMM_CONDUIT.thickness, HMM_CONDUIT.thickness),
      light: new BoxGeometry(HMM_SIGNAL_LIGHT.size, HMM_SIGNAL_LIGHT.size, HMM_SIGNAL_LIGHT.size),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};