// Shared look for Planetary Defense (internal owner id "barbarian…") soldiers:
// the patrols standing on its tiles (client-map-3d-planetary-defense-overlay.ts,
// client-map-render-planetary-defense-overlay.ts) and its side of any battle
// (client-map-3d-capture-overlays.ts's syncBattleOverlayFx) all use this one
// armor tint, so the squad that fights reads as the same soldiers that patrol.
export const PLANETARY_DEFENSE_ARMOR_COLOR = "#5c636b";

export const isPlanetaryDefenseOwnerId = (ownerId: string | null | undefined): boolean =>
  typeof ownerId === "string" && ownerId.startsWith("barbarian");

// A Planetary Defense camp is its garrisoned (SETTLED) tile; the FRONTIER around
// it is the camp's land (docs/planetary-defense-camps-plan.md). Soldiers stand
// only on camps, in both renderers, so a camp stands out from its land.
export const isPlanetaryDefenseCampTile = (tile: { ownerId?: string | null; ownershipState?: string | null } | undefined): boolean =>
  isPlanetaryDefenseOwnerId(tile?.ownerId) && tile?.ownershipState !== "FRONTIER";

// Battle-squad tint for an owner: Planetary Defense always fights in its
// dark grey armor; everyone else in their own overlay color.
export const squadColorForOwner = (ownerId: string, playerColorFor: (ownerId: string) => string): string =>
  isPlanetaryDefenseOwnerId(ownerId) ? PLANETARY_DEFENSE_ARMOR_COLOR : playerColorFor(ownerId);
