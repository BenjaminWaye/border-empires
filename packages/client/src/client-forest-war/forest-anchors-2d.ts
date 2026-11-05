// Where a 2D forest tile's trees stand (tile-relative 0..1), more of them on
// bigger tiles. Shared by the 2D forest overlay and the 2D war-in-a-forest
// painter (client-map-2d-war-scars.ts) so a burnt tree lands where its living
// tree stood. Kept free of canvas/image imports so both stay testable.
export const forestAnchorsForSize = (size: number): ReadonlyArray<readonly [number, number]> =>
  size >= 44
    ? [[0.22, 0.6], [0.42, 0.44], [0.62, 0.58], [0.8, 0.42]]
    : size >= 24
      ? [[0.24, 0.62], [0.5, 0.42], [0.76, 0.58]]
      : [[0.34, 0.6], [0.68, 0.5]];
