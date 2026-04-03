export const clampOwnershipBorderWidth = (baseWidth: number, tileSize: number): number => {
  if (!Number.isFinite(baseWidth) || baseWidth <= 0) return 1;
  if (!Number.isFinite(tileSize) || tileSize <= 0) return Math.max(1, baseWidth);
  const maxForTile = Math.max(0.9, tileSize * 0.08);
  return Math.max(0.9, Math.min(baseWidth, maxForTile));
};
