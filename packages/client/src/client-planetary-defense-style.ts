// Shared look for Planetary Defense (internal owner id "barbarian…") soldiers:
// the patrols standing on its tiles (client-map-3d-planetary-defense-overlay.ts,
// client-map-render-planetary-defense-overlay.ts) and its side of any battle
// (client-map-3d-capture-overlays.ts's syncBattleOverlayFx) all use this one
// armor tint, so the squad that fights reads as the same soldiers that patrol.
export const PLANETARY_DEFENSE_ARMOR_COLOR = "#5c636b";

export const isPlanetaryDefenseOwnerId = (ownerId: string | null | undefined): boolean =>
  typeof ownerId === "string" && ownerId.startsWith("barbarian");

// Battle-squad tint for an owner: Planetary Defense always fights in its
// dark grey armor; everyone else in their own overlay color.
export const squadColorForOwner = (ownerId: string, playerColorFor: (ownerId: string) => string): string =>
  isPlanetaryDefenseOwnerId(ownerId) ? PLANETARY_DEFENSE_ARMOR_COLOR : playerColorFor(ownerId);
