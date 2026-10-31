/** Shared grid-corner sampler for waypoint and aether-bridge marker anchoring. */
export const createCornerSurfaceSampler = (
  cornerYAt: (x: number, y: number) => number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): ((x: number, y: number) => number) => (x, y) => {
  const nextX = wrapX(x + 1);
  const nextY = wrapY(y + 1);
  return (cornerYAt(x, y) + cornerYAt(nextX, y) + cornerYAt(x, nextY) + cornerYAt(nextX, nextY)) / 4;
};
