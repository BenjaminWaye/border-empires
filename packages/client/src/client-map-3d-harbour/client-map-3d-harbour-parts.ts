// The 3D harbour's pieces: the quay on a dock tile (harbour-quay-model.ts) and
// the landing slipways on the beaches beside it (harbour-slipway-model.ts).
// Each is modelled facing +z (the sea), in tile units (x and z across
// -0.5..0.5, y up from the land surface), and merged into one geometry per
// material (harbour-model-builder.ts); the overlay rotates each placement
// toward its water.
//
// Look: the shared structure palette (client-map-3d-town-overlay/town-mesh-builder.ts
// TOWN_COLORS, as on the refineries, mines and Harbor Exchange): black-and-gold
// marble on a charcoal course with brass inlays, grey stone, blackened iron,
// aged brass, warm lamps and cyan status lights.
//
// Lore (docs/lore/galactic-lore.md §10 "What a harbour looks like"): a House
// port -- control office, powered gantry crane and cell bank, sealed containers
// and the armoured troop carriers that make sea crossings (§11). Coasts back
// Coin through freight and tolls; a harbour puts landings ashore at the quay or
// on the beaches beside it, supplied by sea. A transport hub: no guns, no walls.
import { type BufferGeometry, Matrix4 } from "three";
import { buildHarbourModel, disposeHarbourItems, type HarbourMaterial, mergeByMaterial } from "./harbour-model-builder.js";
import { buildQuay } from "./harbour-quay-model.js";
import { buildSlipway } from "./harbour-slipway-model.js";

/** Shrunk slipway: core parts at this scale, pushed seaward so the ramp sits on the waterline beside the tile's other structure. */
export const SHRUNK_SLIPWAY_SCALE = 0.6;
export const SHRUNK_SLIPWAY_SEAWARD_OFFSET = 0.32;

export type HarbourPieceKind = "quay" | "slipway" | "shrunkSlipway";
export const HARBOUR_PIECE_KINDS: readonly HarbourPieceKind[] = ["quay", "slipway", "shrunkSlipway"];

export type HarbourPieceGeometries = Readonly<Record<HarbourPieceKind, ReadonlyMap<HarbourMaterial, BufferGeometry>>>;

/** Builds every harbour piece's merged geometry. The caller owns (and disposes) the result. */
export const buildHarbourPieceGeometries = (): HarbourPieceGeometries => {
  const quayItems = buildHarbourModel(buildQuay);
  const slipwayItems = buildHarbourModel(buildSlipway);
  const shrink = new Matrix4().makeTranslation(0, 0, SHRUNK_SLIPWAY_SEAWARD_OFFSET).multiply(new Matrix4().makeScale(SHRUNK_SLIPWAY_SCALE, SHRUNK_SLIPWAY_SCALE, SHRUNK_SLIPWAY_SCALE));
  const pieces: HarbourPieceGeometries = {
    quay: mergeByMaterial(quayItems),
    slipway: mergeByMaterial(slipwayItems),
    shrunkSlipway: mergeByMaterial(slipwayItems, (item) => item.core, shrink)
  };
  disposeHarbourItems(quayItems);
  disposeHarbourItems(slipwayItems);
  return pieces;
};
