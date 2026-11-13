// How the 2D map's dock sprites (public/overlays/dock-overlay-<facing>.svg)
// frame the 3D quay: the quay turned to face its water, projected in the
// fixed 3/4 view of client-structure-info-catalog/mesh-projection-svg.ts, at
// one scale with the tile centre at the sprite centre for all four facings.
// Lives apart from the three.js model so the 2D renderer can place things on
// the sprite (the capture fire) without building the model.
import { HARBOUR_FACINGS, rotationForFacing, type Facing } from "../client-harbour-slipways/client-harbour-slipways.js";

const normalize = (v: readonly [number, number, number]): [number, number, number] => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
};
const cross = (a: readonly number[], b: readonly number[]): [number, number, number] =>
  [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** Same basis as mesh-projection-svg.ts PROJECTION_RIGHT / PROJECTION_UP (a test keeps them equal). */
export const DOCK_SPRITE_RIGHT = normalize([1, 0, -0.65]);
export const DOCK_SPRITE_UP = cross(normalize([0.65, 0.85, 1]), DOCK_SPRITE_RIGHT);

/** SVG units (of 128) per tile unit: fits every facing's quay inside the sprite (harbour-overlay-svg.test.ts checks it). */
export const DOCK_SPRITE_SCALE = 81;

/** drawDockEndpoint2D draws the 128-unit sprite this many tiles wide, centred on the tile. */
export const DOCK_SPRITE_DRAW_SCALE = 1.14;

/** Sprite filenames, in HARBOUR_FACINGS order. */
export const DOCK_SPRITE_FILES = ["dock-overlay-south.svg", "dock-overlay-east.svg", "dock-overlay-north.svg", "dock-overlay-west.svg"] as const;

export const dockSpriteIndex = (facing: Facing): number =>
  Math.max(0, HARBOUR_FACINGS.findIndex((candidate) => candidate.dx === facing.dx && candidate.dy === facing.dy));

/** Where a point of the quay (its own frame, facing +z) lands on a tile drawn with the dock sprite for `facing`, as fractions of the tile from its top-left. */
export const dockSpritePoint = (facing: Facing, point: readonly [number, number, number]): readonly [number, number] => {
  const turn = rotationForFacing(facing);
  const cos = Math.cos(turn), sin = Math.sin(turn);
  const v = [point[0] * cos + point[2] * sin, point[1], -point[0] * sin + point[2] * cos] as const;
  const dot = (axis: readonly number[]): number => v[0] * axis[0]! + v[1] * axis[1]! + v[2] * axis[2]!;
  const toTile = (projected: number): number => 0.5 + ((projected * DOCK_SPRITE_SCALE) / 128) * DOCK_SPRITE_DRAW_SCALE;
  return [toTile(dot(DOCK_SPRITE_RIGHT)), toTile(-dot(DOCK_SPRITE_UP))];
};
