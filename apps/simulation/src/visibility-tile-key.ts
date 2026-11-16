/** Parses a simulation "x,y" tile key; undefined when malformed. */
export const parseVisibilityTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const separator = tileKey.indexOf(",");
  if (separator < 0) return undefined;
  const x = Number(tileKey.slice(0, separator));
  const y = Number(tileKey.slice(separator + 1));
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  return { x, y };
};
