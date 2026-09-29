// The part catalogue for the Titanium Synthesis (TIT) module: every geometry and
// material the module is built from, plus the profile constants the placement
// code builds against.
//
// This lives apart from the module itself because a part catalogue is a
// self-contained unit of work — it declares what the crucible is made of, and
// the module file only decides where each piece sits. It is also the only place
// that needs to change when a piece's proportions move.
//
// TALL_READ: the whole point of this family is that the crucible stands UP, and
// the two numbers that make that true are the vessel's visible height above the
// pod crown and the width of its broadest hoop. If the visible height does not
// clear the hoop width, the module is a drum with bands on it, and no amount of
// banding will read as tall. Both are published so the regression suite can
// assert the relationship directly rather than trusting that it still holds.
//
// This is the ring's only tall, narrow family. Everything else spreads its main
// mechanism sideways (Umbrite's horizontal barrel, Matterwright's squat retort),
// so the crucible is deliberately slim in radius and generous in height, and
// the height cap — not the bay radius — is the binding constraint on it.

import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, TorusGeometry } from "three";

// Pod: the same 0.075 radius capsule every other family docks with. It is the
// least squashed of the newer families, because a vertical crucible only needs
// a little clearance from the pad rather than a whole headroom's worth.
export const TIT_POD = { y: 0.082, squash: 0.75, radius: 0.075 };
export const TIT_POD_CROWN = TIT_POD.y + (TIT_POD.radius + 0.01) * TIT_POD.squash;
// Crucible: the dominant mechanism, rising from the pod's centre. Its belly is
// sunk well below the pod crown so it is clearly cast into the pod rather than
// resting on it, and it stays slim (0.045) so the three broad hoops and the
// injectors either side still fit inside the bay radius.
export const TIT_CRUCIBLE = { radius: 0.03, height: 0.155, y: 0.1625 };
// Compression_Bands: three broad brass hoops up the crucible's height. Their
// radius clears the shell by a little so they read as straps over a vessel
// rather than rings cut into it.
export const TIT_BAND = { radius: 0.0335, tube: 0.0085, y0: 0.107, y1: 0.1625, y2: 0.218 };
// Cap_Ring: a heavy brass ring closing the crucible's mouth, which is the
// module's highest point.
export const TIT_CAP = { y: 0.238, radius: 0.0335, tube: 0.0095 };
// Viewing_Slit: a narrow reinforced window up the crucible's front face. The
// frame is a dark steel boss standing proud of the shell, the glow inside it is
// the white-hot interior, and two thin brass strips edge the opening.
//
// The three layers are separated by depth, not just by width, and the order
// matters: frame face at 0.0485, glow face at 0.0505, brass edge face at
// 0.051. The hot bar therefore stands a little proud of its own bezel and the
// brass edging stands a little proud of the bar, so from the strategy camera
// the slit reads as a lit recess rather than a bright sticker on a dark box.
export const TIT_SLIT = {
  y: 0.19,
  frameX: 0.027,
  frameWidth: 0.016,
  frameHeight: 0.122,
  frameDepth: 0.012,
  glowX: 0.0325,
  glowWidth: 0.0085,
  glowHeight: 0.112,
  glowDepth: 0.005,
  edgeX: 0.0325,
  edgeGap: 0.0064
};

// The pod's top surface at a given horizontal distance from its centre. The feed
// pipes need this because they have to land ON the pod's shoulder, and a capsule
// is a curved surface: landing them at a flat guessed height either floats the
// pipe above the pod or sinks it into the pod, and neither reads as bolted on.
// The crucible's height above the pod crown, and the width of its broadest hoop.
// TALL_READ above is the reason both exist.
export const TIT_CRUCIBLE_VISIBLE_HEIGHT = TIT_CRUCIBLE.y + TIT_CRUCIBLE.height * 0.5 - TIT_POD_CROWN;
export const TIT_CRUCIBLE_OUTER_WIDTH = (TIT_BAND.radius + TIT_BAND.tube) * 2;

export const podTopAt = (r: number): number =>
  TIT_POD.y + TIT_POD.squash * (0.01 + Math.sqrt(Math.max(0, TIT_POD.radius * TIT_POD.radius - r * r)));
// Injectors: two opposing assemblies at the crucible's base, angled slightly
// upward so their noses climb into the vessel's lower flank. Their inner ends
// deliberately overlap the shell so the joint reads as inserted, not butted.
export const TIT_INJECTOR = { radius: 0.017, length: 0.038, y: 0.16, z: 0.066, rise: 0.28 };
// Pressure_Valves: one stub and handwheel on each injector, so the pair of
// assemblies is legibly valved rather than just two barrels.
export const TIT_VALVE = { lift: 0.02, stemRadius: 0.005, stemHeight: 0.014, knobRadius: 0.009, knobTube: 0.003 };
// Feed_Pipes: one short heavy run per injector, carrying charge up from the
// pod's shoulder.
export const TIT_PIPE = { radius: 0.007, flangeTube: 0.0035 };

export type TitaniumSynthesisMaterials = {
  readonly iron: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  readonly pipe: MeshStandardMaterial;
  // The white-hot interior seen through the slit. This is the one genuinely
  // bright surface in the module, and it is the whole point of the family: it
  // is the only light in the ring that is not a power accent.
  readonly whiteHot: MeshStandardMaterial;
  // Restrained cyan: the collar where the crucible meets the pod, and the rear
  // coupling's contact tip. Enough to say "this is AFC-powered", not enough to
  // compete with the slit.
  readonly cyan: MeshStandardMaterial;
};

export type TitaniumSynthesisGeometries = {
  readonly base: BufferGeometry;
  readonly baseRing: BufferGeometry;
  readonly pod: BufferGeometry;
  readonly podBand: BufferGeometry;
  readonly crucible: BufferGeometry;
  readonly crucibleBand: BufferGeometry;
  readonly capRing: BufferGeometry;
  readonly collar: BufferGeometry;
  readonly slitFrame: BufferGeometry;
  readonly slitGlow: BufferGeometry;
  readonly slitEdge: BufferGeometry;
  readonly injector: BufferGeometry;
  readonly injectorBand: BufferGeometry;
  readonly valveStem: BufferGeometry;
  readonly valveKnob: BufferGeometry;
  readonly feedPipe: BufferGeometry;
  readonly feedFlange: BufferGeometry;
  readonly coupling: BufferGeometry;
  readonly couplingRing: BufferGeometry;
  readonly couplingTip: BufferGeometry;
};

export type TitaniumSynthesisParts = {
  readonly geometries: TitaniumSynthesisGeometries;
  readonly materials: TitaniumSynthesisMaterials;
};

export const createTitaniumSynthesisParts = (): TitaniumSynthesisParts => {
  const iron = new MeshStandardMaterial({ color: "#22242a", roughness: 0.5, metalness: 0.55, flatShading: true });
  const steel = new MeshStandardMaterial({ color: "#17181d", roughness: 0.62, metalness: 0.5, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#8b6c3d", roughness: 0.42, metalness: 0.85, flatShading: true });
  const pipe = new MeshStandardMaterial({ color: "#2c2f36", roughness: 0.55, metalness: 0.6, flatShading: true });
  // Metal under extreme heat: a near-white body colour as well as a hot
  // emissive, so the slit still reads as incandescent when the tonemapper
  // compresses the highlight. A close hero render confirms it clips to white;
  // at strategy-camera distance it settles to a bright seam rather than a
  // highlight, which is the intended read for a narrow slit.
  const whiteHot = new MeshStandardMaterial({
    color: "#fff6e4",
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
    emissive: "#ffeec4",
    emissiveIntensity: 4.2
  });
  const cyan = new MeshStandardMaterial({
    color: "#0d2430",
    roughness: 0.32,
    metalness: 0.15,
    flatShading: true,
    emissive: "#37b6d6",
    emissiveIntensity: 1.2
  });

  // Small curved parts use high segment counts so flat-shaded facets never read
  // as black crease lines (see the Siege Lens Foundry module notes).
  return {
    materials: { iron, steel, brass, pipe, whiteHot, cyan },
    geometries: {
      base: new CylinderGeometry(0.1, 0.105, 0.032, 16),
      baseRing: new TorusGeometry(0.12, 0.012, 12, 28),
      pod: new CapsuleGeometry(TIT_POD.radius, 0.02, 6, 16),
      podBand: new TorusGeometry(0.079, 0.011, 10, 26),
      // Crucible: the vessel, its three broad hoops, its cap ring and the
      // restrained cyan collar it stands on.
      crucible: new CylinderGeometry(TIT_CRUCIBLE.radius, TIT_CRUCIBLE.radius + 0.004, TIT_CRUCIBLE.height, 16),
      crucibleBand: new TorusGeometry(TIT_BAND.radius, TIT_BAND.tube, 10, 24),
      capRing: new TorusGeometry(TIT_CAP.radius, TIT_CAP.tube, 10, 24),
      collar: new TorusGeometry(TIT_CRUCIBLE.radius + 0.003, 0.007, 8, 20),
      // Viewing_Slit: frame, glow, and one brass edging strip (placed twice).
      slitFrame: new BoxGeometry(TIT_SLIT.frameWidth, TIT_SLIT.frameHeight, TIT_SLIT.frameDepth),
      slitGlow: new BoxGeometry(TIT_SLIT.glowWidth, TIT_SLIT.glowHeight, TIT_SLIT.glowDepth),
      slitEdge: new BoxGeometry(0.0028, TIT_SLIT.frameHeight - 0.008, 0.007),
      // Injectors: body, brass band, and the valve stub and handwheel on top.
      injector: new CylinderGeometry(TIT_INJECTOR.radius, TIT_INJECTOR.radius, TIT_INJECTOR.length, 12),
      injectorBand: new TorusGeometry(TIT_INJECTOR.radius + 0.002, 0.005, 8, 18),
      valveStem: new CylinderGeometry(TIT_VALVE.stemRadius, TIT_VALVE.stemRadius + 0.002, TIT_VALVE.stemHeight, 8),
      valveKnob: new TorusGeometry(TIT_VALVE.knobRadius, TIT_VALVE.knobTube, 8, 16),
      // Feed_Pipes: heavy short runs with a brass flange at the injector.
      feedPipe: new CylinderGeometry(TIT_PIPE.radius, TIT_PIPE.radius, 1, 8),
      feedFlange: new TorusGeometry(TIT_PIPE.radius + 0.003, TIT_PIPE.flangeTube, 8, 14),
      // Rear coupling, as on every other family.
      coupling: new CylinderGeometry(0.024, 0.026, 1, 12),
      couplingRing: new TorusGeometry(0.03, 0.011, 10, 20),
      couplingTip: new CylinderGeometry(0.014, 0.014, 0.016, 14)
    }
  };
};
