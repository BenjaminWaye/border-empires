export const resolveOwnerColor = (
  ownerId: string,
  playerColors: ReadonlyMap<string, string>,
  fallbackOwnerColor: (ownerId: string) => string
): string => (ownerId.startsWith("barbarian") ? fallbackOwnerColor(ownerId) : playerColors.get(ownerId) ?? fallbackOwnerColor(ownerId));
