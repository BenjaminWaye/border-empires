// The part catalogue for the Hive Mind II (HMM2) module: every geometry and
// material the module is built from, plus the profile constants the placement
// code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the module is made of, and the
// module file only decides where each piece sits. It is also the only place that
// needs to change when a piece's proportions move.
//
// MAIN_READ: Hive Mind II is the upgraded evolution of the Hive Mind module for
// the settlement — the same rounded pod and circular AFC docking interface, but
// command is now split across TWO coordinated minds. Two dark metallic command
// spheres stand side by side above the pod inside a shared brass gimbal frame,
// linked by a thick glowing synchronization bridge with a cyan pulse running
// along it, so the twin cores read as one synchronized command assembly rather
// than two separate units. A broad flat brass signal ring girdles the pair and
// rotates slowly about the module's vertical axis — three brass teeth on its
// outer edge make the spin legible — and four relay nodes sit symmetrically at
// the 45° diagonals, each piped into its own nearest core by a short rigid
// conduit and marked with a restrained cyan signal light on its outward face.
// Everything mechanical stays in the shared family language: blackened iron pod
// and relays, dark steel cores and conduits, aged brass gimbal, ring and trim,
// with a restrained cyan command-signal glow and no antennas or tiny electronics.
//
// Strong readable silhouette from strategy-game camera distance — rounded pod +
// twin command spheres + shared rotating ring + four surrounding relay nodes
// with their signal lights — in the shared materials of the ring: blackened
// iron, dark steel, aged brass, and a restrained cyan command-signal glow.
//
// Local axes (shared with every AFC family): +X is FORWARD — the socket's
// outward radial direction — and the rear coupling hangs at -X. The twin cores
// stand side by side along the module's OWN Z axis: one at +z, one at -z, both
// on the centre line (x = 0). The four relays orbit them at the 45° diagonal
// azimuths, two forward and two back.

import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with.
export const HMM2_POD = { y: 0.082, squash: 0.74, radius: 0.075 };
export const HMM2_POD_CROWN = HMM2_POD.y + (HMM2_POD.radius + 0.01) * HMM2_POD.squash;
// Twin_Cores: the two identical low-poly faceted command orbs standing side by
// side along the module's Z axis — two coordinated minds. Their crowns are the
// module's tallest point.
export const HMM2_CORE = { r: 0.03 };
export const HMM2_TWIN = { y: 0.2, dz: 0.048 };
// Gimbal: the shared brass cradle frame — a flat crescent under each core,
// held in the same low half-ring so the two cores read as one commanded pair.
export const HMM2_GIMBAL = { radius: 0.034, tube: 0.008, y: 0.163 };
// Bridge: the thick dark-steel synchronization slab linking the twin cores
// across the seam between them.
export const HMM2_BRIDGE = { breadth: 0.02, thickness: 0.02, length: 0.096 };
// Pulse: the restrained cyan command pulse that slides along the bridge top —
// the family's "both minds agree" heartbeat.
export const HMM2_PULSE = { size: 0.006, length: 0.01, y: 0.213, travel: 0.009, speed: 0.0012 };
// Signal_Ring: the broad flat brass ring girdling the twin cores, rotating
// slowly about the module's vertical axis. It is deliberately flat — a tilted
// ring would either dip into the pod or breach the AFC bay cap.
export const HMM2_RING = { radius: 0.091, tube: 0.009, y: 0.196 };
export const HMM2_RING_START_ROLL = 0.25;
// Slow steady scan, the same tempo as the Hive Mind scan ring: 0.0005 rad per
// ms is one full sweep every ~12.5s — a commander's gaze, never a frantic spin.
export const HMM2_RING_SPEED_MS = 0.0005;
// Teeth: the three brass teeth on the ring's outer edge that make its rotation
// legible at distance, orbiting at the advancing roll.
export const HMM2_TOOTH = { size: 0.009, radius: 0.097, y: 0.196 };
export const HMM2_TOOTH_COUNT = 3;
// Relays: four secondary nodes at the 45° diagonal azimuths, below the ring,
// each piped into its own nearest core by a short rigid conduit and marked with
// a cyan signal light on its outward face.
export const HMM2_RELAY = { r: 0.013, radius: 0.082, y: 0.161 };
export const HMM2_RELAY_AZIMUTHS = [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4];
// Conduits: thick rigid dark-steel rods running from each relay to the core on
// the relay's own Z side.
export const HMM2_CONDUIT = { radius: 0.012 };
// Signal_Lights: the restrained cyan command signals, proud of each relay's
// outward face.
export const HMM2_SIGNAL_LIGHT = { size: 0.005, radius: 0.096, y: HMM2_RELAY.y };
// The faceted command cores sit in the shared low-poly icosahedron orientation,
// whose highest vertex rises only t/√(1+t²) of the sphere's radius above its
// centre — so a core's true crown is below the raw radius by that factor. This
// is the couplet that keeps every height assertion honest: the published height
// is the REAL crown, not the idealised circumsphere.
export const HMM2_ORB_POLE = 0.85065080835204;
// The module's tallest point: the twin cores' crown, 0.2255 local = 0.2999
// world, under the 0.34 ceiling.
export const HMM2_TOWER_TOP = HMM2_TWIN.y + HMM2_CORE.r * HMM2_ORB_POLE;

export type HiveMindIiMaterials = {
  readonly iron: MeshStandardMaterial;
  // The dark steel of the twin cores, their bridge and their conduits —
  // distinctly darker than the blackened iron body so the whole command network
  // reads as one system.
  readonly steel: MeshStandardMaterial;
  // The aged brass gimbal frame, signal ring, teeth and trim.
  readonly brass: MeshStandardMaterial;
  // The restrained cyan command-signal glow on the relays, the bridge pulse and
  // the cyan AFC contact tip on the rear coupling.
  readonly cyan: MeshStandardMaterial;
};

export type HiveMindIiGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly core: BufferGeometry;
  readonly bridge: BufferGeometry;
  readonly pulse: BufferGeometry;
  readonly gimbal: BufferGeometry;
  readonly ring: BufferGeometry;
  readonly tooth: BufferGeometry;
  readonly relay: BufferGeometry;
  readonly conduit: BufferGeometry;
  readonly light: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type HiveMindIiParts = {
  readonly geometries: HiveMindIiGeometries;
  readonly materials: HiveMindIiMaterials;
};

export const createHiveMindIiParts = (): HiveMindIiParts => {
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

  // Each command core is a faceted low-poly ball — 20 flat triangles read as a
  // heavy machined sphere at strategy-game distance.
  const core = new IcosahedronGeometry(HMM2_CORE.r, 0);
  // The gimbal cradle: a flat brass crescent (a half torus, hole up) swung under
  // each core by rotateZ so the arc spans the BOTTOM half — a cup, not a crown.
  const gimbal = new TorusGeometry(HMM2_GIMBAL.radius, HMM2_GIMBAL.tube, 8, 18, Math.PI);
  gimbal.rotateZ(Math.PI);
  // The broad rotating signal ring: flat (hole up) so it girdles the twin cores
  // without ever tilting into the pod or the bay cap.
  const ring = new TorusGeometry(HMM2_RING.radius, HMM2_RING.tube, 8, 36);

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, cyan },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(HMM2_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      core,
      bridge: new BoxGeometry(HMM2_BRIDGE.breadth, HMM2_BRIDGE.thickness, HMM2_BRIDGE.length),
      pulse: new BoxGeometry(HMM2_PULSE.size, HMM2_PULSE.size, HMM2_PULSE.length),
      gimbal,
      ring,
      tooth: new BoxGeometry(HMM2_TOOTH.size, HMM2_TOOTH.size, HMM2_TOOTH.size),
      relay: new IcosahedronGeometry(HMM2_RELAY.r, 0),
      // A unit-length cylinder: the placement code stretches it along the
      // relay-to-core direction.
      conduit: new CylinderGeometry(HMM2_CONDUIT.radius, HMM2_CONDUIT.radius, 1, 10),
      light: new BoxGeometry(HMM2_SIGNAL_LIGHT.size, HMM2_SIGNAL_LIGHT.size, HMM2_SIGNAL_LIGHT.size),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};