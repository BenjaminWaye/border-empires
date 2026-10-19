// Baked geometry for the mustering banner: a board-game war gonfalon
// standing on the same octagonal stone-and-brass plate the towns use
// (client-map-3d-town-overlay/town-parts.ts octagonPlate). An iron pole
// carries a brass crossbar under a little gabled cap, and the cloth hangs
// from the crossbar to a pointed tail.
//
// Built once per page load with the town mesh builder, so the plinth shares
// the towns' palette and their matte / metallic material split. The parts
// that wear the owner's colour (the enamel band round the plinth and the
// inlaid ring on its top) bake into a separate `tinted` geometry with no
// vertex colour, so the overlay can colour them per instance.
//
// Local frame: one tile is 1 x 1 centred on the origin, y = 0 is the ground
// (the overlay lifts it just clear of the terrain), +z faces the camera (it always looks north).
import { BufferAttribute, BufferGeometry } from "three";
import { createRoutedTownBuilder, createTownMeshBuilder } from "../client-map-3d-town-overlay/town-mesh-builder.js";

export const MUSTER_PLINTH_RADIUS = 0.27;
/** Top of the plinth's lower slab, and of its raised stone tier. */
const PLINTH_TIER_Y = 0.05;
export const MUSTER_PLINTH_TOP_Y = 0.1;
const PLINTH_TOP_Y = MUSTER_PLINTH_TOP_Y;
const POLE_RADIUS = 0.016;
const POLE_BASE_Y = PLINTH_TOP_Y + 0.046;
const CROSSBAR_Y = 0.98;

/** Cloth rest shape. The shader (muster-banner-cloth-material.ts) rebuilds
 * these rest positions from the cloth uv, so keep the two in step through
 * this one table. The cloth hangs just in front of the pole. */
export const BANNER_CLOTH = {
  topY: CROSSBAR_Y - 0.012,
  z: POLE_RADIUS + 0.006,
  width: 0.3,
  /** Length down the middle, to the tip of the tail. */
  height: 0.56,
  /** How much shorter the side edges are than the middle, as a fraction of the height. */
  tail: 0.16,
  segmentsU: 14,
  segmentsV: 28
} as const;

export type MusterBannerGeometry = {
  readonly body: BufferGeometry;
  readonly metal: BufferGeometry;
  readonly tinted: BufferGeometry;
  readonly cloth: BufferGeometry;
};

const OCTAGON_TURN = Math.PI / 8;

const buildStandard = (): Omit<MusterBannerGeometry, "cloth"> => {
  const matte = createTownMeshBuilder();
  const metal = createTownMeshBuilder();
  const tinted = createTownMeshBuilder();
  const body = createRoutedTownBuilder(matte, metal);
  const r = MUSTER_PLINTH_RADIUS;

  // Two-tier octagonal plinth, heavy like a board-game piece's base. The
  // lower slab is iron, running well below 0 so a sloped tile never shows a
  // gap, girdled by a deep enamel band in the owner's colour under a brass
  // lip; an inlaid ring in the owner's colour runs round its top, inside a
  // ring of brass studs. A raised stone tier on top carries the pedestal.
  body.cylinder(0, -0.1, 0, r, r * 1.02, 0.1, "ironDark", 8, OCTAGON_TURN);
  tinted.cylinder(0, 0, 0, r * 1.025, r * 1.025, 0.032, "plate", 8, OCTAGON_TURN);
  body.cylinder(0, 0.032, 0, r * 1.035, r * 1.035, 0.01, "brass", 8, OCTAGON_TURN);
  body.cylinder(0, 0.042, 0, r * 0.99, r, 0.008, "stone", 8, OCTAGON_TURN);
  tinted.ring(0, PLINTH_TIER_Y, 0, r * 0.84, "plate", 0.06);
  for (let k = 0; k < 8; k += 1) {
    const angle = OCTAGON_TURN * 2 * k;
    body.cylinder(Math.cos(angle) * r * 0.93, PLINTH_TIER_Y, Math.sin(angle) * r * 0.93, 0.011, 0.013, 0.008, "brass", 8);
  }
  const tier = r * 0.66;
  body.cylinder(0, PLINTH_TIER_Y, 0, tier, tier * 1.04, PLINTH_TOP_Y - PLINTH_TIER_Y, "stoneLight", 8, OCTAGON_TURN);
  body.ring(0, PLINTH_TOP_Y - 0.004, 0, tier * 0.86, "brass", 0.05);

  // Stepped pedestal the pole is socketed into.
  body.cylinder(0, PLINTH_TOP_Y, 0, 0.064, 0.078, 0.028, "stoneDark", 8, OCTAGON_TURN);
  body.cylinder(0, PLINTH_TOP_Y + 0.028, 0, 0.044, 0.054, 0.018, "brass", 8, OCTAGON_TURN);

  // Iron pole with brass bands.
  body.cylinder(0, POLE_BASE_Y, 0, POLE_RADIUS * 0.85, POLE_RADIUS, CROSSBAR_Y - POLE_BASE_Y + 0.02, "iron", 10);
  for (const y of [0.24, 0.38]) body.cylinder(0, y, 0, POLE_RADIUS * 1.5, POLE_RADIUS * 1.5, 0.012, "brassDark", 10);

  // Crossbar the cloth hangs from, with knobbed ends, under a gabled cap
  // and a spear finial.
  const barWidth = BANNER_CLOTH.width + 0.05;
  body.box(0, CROSSBAR_Y - 0.012, 0, barWidth, 0.024, 0.032, "brassDark");
  for (const side of [-1, 1]) body.ellipsoid(side * (barWidth / 2 + 0.008), CROSSBAR_Y, 0, 0.016, 0.016, 0.016, "brass");
  body.box(0, CROSSBAR_Y + 0.012, 0, barWidth * 0.92, 0.008, 0.05, "brass");
  body.gable(0, CROSSBAR_Y + 0.02, 0, barWidth * 0.86, 0.05, 0.05, "brass");
  body.cylinder(0, CROSSBAR_Y + 0.064, 0, 0.012, 0.014, 0.02, "brassDark", 8);
  body.cone(0, CROSSBAR_Y + 0.084, 0, 0.014, 0.06, "brass", 8);

  const builtBody = matte.build();
  const builtMetal = metal.build();
  const builtTinted = tinted.build();
  if (!builtBody || !builtMetal || !builtTinted) throw new Error("muster banner produced no geometry");
  // The tinted parts take their colour from instanceColor alone.
  builtTinted.deleteAttribute("color");
  return { body: builtBody, metal: builtMetal, tinted: builtTinted };
};

/** Rest position of the cloth at (u, v), u = 0..1 left to right, v = 1 along
 * the crossbar and 0 along the hem. Each column hangs a little further than
 * the one beside it towards the middle, giving the pointed tail. Mirrored in
 * the shader. */
export const bannerRestPoint = (u: number, v: number): { x: number; y: number } => {
  const columnLength = BANNER_CLOTH.height * (1 - BANNER_CLOTH.tail * Math.abs(2 * u - 1));
  return { x: (u - 0.5) * BANNER_CLOTH.width, y: BANNER_CLOTH.topY - (1 - v) * columnLength };
};

/** Grid of the cloth's (u, v) in an `aBannerUv` attribute. Positions hold the
 * rest shape for bounds only: the shader places every vertex from its uv. */
const buildCloth = (): BufferGeometry => {
  const { segmentsU, segmentsV } = BANNER_CLOTH;
  const columns = segmentsU + 1;
  const rows = segmentsV + 1;
  const uvs = new Float32Array(columns * rows * 2);
  const positions = new Float32Array(columns * rows * 3);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const u = i / segmentsU;
      const v = j / segmentsV;
      const index = j * columns + i;
      const rest = bannerRestPoint(u, v);
      uvs.set([u, v], index * 2);
      positions.set([rest.x, rest.y, BANNER_CLOTH.z], index * 3);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < segmentsV; j += 1) {
    for (let i = 0; i < segmentsU; i += 1) {
      const a = j * columns + i;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aBannerUv", new BufferAttribute(uvs, 2));
  // Placeholder normals: the shader derives the real ones from the wind.
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(columns * rows * 3).fill(0), 3));
  geometry.setIndex(indices);
  return geometry;
};

let cached: MusterBannerGeometry | undefined;

/** Shared by every muster overlay, so overlays must not dispose it. */
export const getMusterBannerGeometry = (): MusterBannerGeometry => {
  cached ??= { ...buildStandard(), cloth: buildCloth() };
  return cached;
};
