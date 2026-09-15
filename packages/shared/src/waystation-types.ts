// The wire shape of a tile's waystation state, split into its own file so
// packages/shared/src/types.ts and packages/client/src/client-types.ts (both
// already over the repo's 500-line file cap) can reference it with a single
// import line instead of inlining the full object type twice. See
// apps/simulation/src/runtime-waystation-activation.ts for how each field is
// populated, and packages/client/src/client-waystation-activation/ for the
// client popup that reads grantedEffect/detail fields off it.
export type WaystationTileState = {
  activated: boolean;
  activatedByPlayerId?: string;
  /** Which of the four possible effects fired. Absent on a dormant (not-yet-activated) waystation. */
  grantedEffect?: "VISION" | "POPULATION" | "TECH" | "RESOURCE_SLOT";
  /** VISION only: the (x, y) actually revealed -- a nearby town's tile, or the waystation's own tile as a fallback. */
  revealedAtX?: number;
  revealedAtY?: number;
  /** TECH only: the tech id granted. Absent if the player already owned every tier-1 tech (no-op fallback -- the tile still activates). */
  grantedTechId?: string;
  /** RESOURCE_SLOT only: which resource received the +1 slot bump. */
  grantedResource?: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";
};
