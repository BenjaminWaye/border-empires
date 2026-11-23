export const resolveOwnerColor = (
  ownerId: string,
  playerColors: ReadonlyMap<string, string>,
  fallbackOwnerColor: (ownerId: string) => string
): string => (ownerId.startsWith("barbarian") ? fallbackOwnerColor(ownerId) : playerColors.get(ownerId) ?? fallbackOwnerColor(ownerId));

// Deterministic per-owner hue, used when a player hasn't been assigned an
// explicit color yet (state.playerColors) — same hash both client-map-facade.ts
// and any UI needing a same-tick color guess (e.g. the tile-menu battle bar)
// should use, so an unassigned player's color never disagrees between the map
// and other UI.
export const fallbackOwnerColor = (ownerId: string): string => {
  // Light warm ash grey: at the same frontier tint strength as a House, the old near-black #2f3842 read as a
  // shadow on the ground (Playtest Run 4: Planetary Defense took land players never saw coming). Warm, so it
  // doesn't read as the cool blue-white fog haze; no hue of its own, so it doesn't read as a House.
  if (ownerId.startsWith("barbarian")) return "#c8c1b6";
  let hash = 2166136261;
  for (let index = 0; index < ownerId.length; index += 1) {
    hash ^= ownerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue} 70% 48%)`;
};
