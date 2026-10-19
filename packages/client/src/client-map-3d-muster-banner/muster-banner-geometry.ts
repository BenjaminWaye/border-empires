// Baked geometry for the mustering banner: a premium board-game war
// gonfalon on a heavy two-tier octagonal plinth in the towns' stone and
// brass (client-map-3d-town-overlay/town-parts.ts octagonPlate). A turned
// iron pole carries a brass crossbar under a little gabled cap, and the
// cloth hangs from the crossbar to a pointed tail.
//
// Built once per page load with the town mesh builder, so the plinth shares
// the towns' palette and their matte / metallic material split. The parts
// that wear the owner's colour (the lacquered band round the plinth, the
// inlaid ring, the gems and the tassels) bake into a separate `tinted` geometry with no
// vertex colour, so the overlay can colour them per instance.
//
// Local frame: one tile is 1 x 1 centred on the origin, y = 0 is the ground
// (the overlay lifts it just clear of the terrain), +z faces the camera (it
// always looks north).
import { BufferAttribute, BufferGeometry } from "three";
import { createRoutedTownBuilder, createTownMeshBuilder, type TownMeshBuilder } from "../client-map-3d-town-overlay/town-mesh-builder.js";

export const MUSTER_PLINTH_RADIUS = 0.27;
/** Top of the plinth's lower slab, and of its raised stone tier. */
const PLINTH_TIER_Y = 0.05;
export const MUSTER_PLINTH_TOP_Y = 0.1;
const PLINTH_TOP_Y = MUSTER_PLINTH_TOP_Y;
/** Heights of the stone ledges that walls rise from (the stone finish pools shade above each). */
export const MUSTER_PLINTH_LEDGES: readonly number[] = [PLINTH_TIER_Y, PLINTH_TOP_Y];
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
  /** Depth of the gold fringe along the hem, part of the height above. */
  fringe: 0.026,
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

/** Point on the corner of an octagon of `radius` turned OCTAGON_TURN, the
 * way the builder's 8-sided cylinders are (their flats face the axes). */
const octagonCorner = (radius: number, k: number): readonly [number, number] => {
  const angle = (k * Math.PI) / 4 + OCTAGON_TURN;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius];
};

/** Two-tier octagonal plinth, heavy and chamfered like a premium board-game
 * piece's base. The lower slab is iron, running well below 0 so a sloped
 * tile never shows a gap, girdled by a deep lacquered band in the owner's
 * colour, pinned at each corner by a brass cap, under a brass lip and a
 * chamfered stone top with an inlaid ring of the owner's colour inside a
 * ring of brass studs. A raised, chamfered stone tier set with four gems
 * in the owner's colour carries the pedestal. */
const buildPlinth = (body: TownMeshBuilder, tinted: TownMeshBuilder): void => {
  const r = MUSTER_PLINTH_RADIUS;
  body.cylinder(0, -0.1, 0, r, r * 1.02, 0.1, "ironDark", 8, OCTAGON_TURN);
  tinted.cylinder(0, 0, 0, r * 1.025, r * 1.025, 0.032, "plate", 8, OCTAGON_TURN);
  for (let k = 0; k < 8; k += 1) {
    const [x, z] = octagonCorner(r * 1.03, k);
    body.cylinder(x, -0.004, z, 0.009, 0.009, 0.04, "brass", 6);
    body.ellipsoid(x, 0.036, z, 0.011, 0.008, 0.011, "brass");
  }
  body.cylinder(0, 0.032, 0, r * 1.035, r * 1.035, 0.01, "brass", 8, OCTAGON_TURN);
  // Chamfer: the slab's top edge bevels in to its flat top.
  body.cylinder(0, 0.042, 0, r * 0.93, r * 1.0, PLINTH_TIER_Y - 0.042, "stone", 8, OCTAGON_TURN);
  tinted.ring(0, PLINTH_TIER_Y, 0, r * 0.8, "plate", 0.06);
  for (let k = 0; k < 8; k += 1) {
    const angle = OCTAGON_TURN * 2 * k;
    body.cylinder(Math.cos(angle) * r * 0.88, PLINTH_TIER_Y, Math.sin(angle) * r * 0.88, 0.01, 0.012, 0.008, "brass", 8);
  }

  const tier = r * 0.62;
  body.cylinder(0, PLINTH_TIER_Y, 0, tier, tier * 1.04, PLINTH_TOP_Y - PLINTH_TIER_Y - 0.014, "stoneLight", 8, OCTAGON_TURN);
  body.cylinder(0, PLINTH_TOP_Y - 0.014, 0, tier * 0.9, tier, 0.014, "stoneLight", 8, OCTAGON_TURN);
  body.ring(0, PLINTH_TOP_Y - 0.016, 0, tier * 1.0, "brass", 0.05);
  for (let k = 0; k < 4; k += 1) {
    const angle = Math.PI / 4 + (k * Math.PI) / 2;
    const [x, z] = [Math.cos(angle) * tier * 0.68, Math.sin(angle) * tier * 0.68];
    body.cylinder(x, PLINTH_TOP_Y, z, 0.016, 0.018, 0.006, "brassDark", 8);
    tinted.gem(x, PLINTH_TOP_Y + 0.012, z, 0.013, 0.014, "plate");
  }

  // Stepped, fluted pedestal the pole is socketed into.
  body.cylinder(0, PLINTH_TOP_Y, 0, 0.062, 0.076, 0.026, "stoneDark", 8, OCTAGON_TURN);
  body.cylinder(0, PLINTH_TOP_Y + 0.026, 0, 0.052, 0.058, 0.006, "brass", 8, OCTAGON_TURN);
  body.cylinder(0, PLINTH_TOP_Y + 0.032, 0, 0.03, 0.044, 0.02, "brassDark", 12);
};

/** Turned iron pole, the crossbar the cloth hangs from with knobbed ends and
 * a tassel in the owner's colour on a cord from each, under a gabled cap
 * and a spear finial. */
const buildPoleAndCrossbar = (body: TownMeshBuilder, tinted: TownMeshBuilder): void => {
  body.cylinder(0, POLE_BASE_Y, 0, POLE_RADIUS * 0.85, POLE_RADIUS, CROSSBAR_Y - POLE_BASE_Y + 0.02, "iron", 10);
  body.cylinder(0, POLE_BASE_Y, 0, POLE_RADIUS * 1.6, POLE_RADIUS * 1.9, 0.03, "brass", 10);
  // A turned knop and collars partway up, where the pole shows under the tail.
  body.ellipsoid(0, 0.27, 0, 0.026, 0.02, 0.026, "brass");
  for (const y of [0.24, 0.3]) body.cylinder(0, y - 0.004, 0, POLE_RADIUS * 1.4, POLE_RADIUS * 1.4, 0.008, "brassDark", 10);

  const barWidth = BANNER_CLOTH.width + 0.05;
  body.box(0, CROSSBAR_Y - 0.012, 0, barWidth, 0.024, 0.032, "brassDark");
  for (const side of [-1, 1]) {
    const endX = side * (barWidth / 2 + 0.008);
    body.ellipsoid(endX, CROSSBAR_Y, 0, 0.016, 0.016, 0.016, "brass");
    body.cone(endX + side * 0.014, CROSSBAR_Y - 0.004, 0, 0.007, 0.022, "brass", 6);
    const tasselX = endX - side * 0.004;
    const cordBottom = CROSSBAR_Y - 0.085;
    body.pipe(tasselX, CROSSBAR_Y - 0.014, 0.02, tasselX, cordBottom, 0.02, 0.003, "brassDark");
    body.ellipsoid(tasselX, cordBottom, 0.02, 0.009, 0.008, 0.009, "brass");
    tinted.cylinder(tasselX, cordBottom - 0.048, 0.02, 0.006, 0.013, 0.042, "plate", 8);
  }
  body.box(0, CROSSBAR_Y + 0.012, 0, barWidth * 0.92, 0.008, 0.05, "brass");
  body.gable(0, CROSSBAR_Y + 0.02, 0, barWidth * 0.86, 0.05, 0.05, "brass");
  body.cylinder(0, CROSSBAR_Y + 0.064, 0, 0.012, 0.014, 0.02, "brassDark", 8);
  body.ellipsoid(0, CROSSBAR_Y + 0.09, 0, 0.014, 0.012, 0.014, "brass");
  body.cone(0, CROSSBAR_Y + 0.096, 0, 0.012, 0.06, "brass", 8);
};

const buildStandard = (): Omit<MusterBannerGeometry, "cloth"> => {
  const matte = createTownMeshBuilder();
  const metal = createTownMeshBuilder();
  const tinted = createTownMeshBuilder();
  const body = createRoutedTownBuilder(matte, metal);
  buildPlinth(body, tinted);
  buildPoleAndCrossbar(body, tinted);
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
