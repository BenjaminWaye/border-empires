export const resolveOwnerColor = (
  ownerId: string,
  playerColors: ReadonlyMap<string, string>,
  fallbackOwnerColor: (ownerId: string) => string
): string => playerColors.get(ownerId) ?? fallbackOwnerColor(ownerId);
