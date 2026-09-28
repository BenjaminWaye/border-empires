// The wire shape of a tile's waystation state, split into its own file so
// packages/shared/src/types.ts and packages/client/src/client-types.ts (both
// already over the repo's 500-line file cap) can reference it with a single
// import line instead of inlining the full object type twice. See
// apps/simulation/src/runtime-waystation-activation.ts for how each field is
// populated, and packages/client/src/client-waystation-activation/ for the
// client popup that reads grantedEffect/detail fields off it.
import type { WaystationGoldTier } from "./waystation-rewards.js";

export type WaystationGrantedEffect = "VISION" | "POPULATION" | "TECH" | "RESOURCE_SLOT" | "GOLD" | "MANPOWER";

export type WaystationTileState = {
  activated: boolean;
  activatedByPlayerId?: string;
  /** Which of the six possible effects fired. Absent on a dormant (not-yet-activated) waystation. A TECH roll with no unowned tier-1 tech left is recorded as GOLD. */
  grantedEffect?: WaystationGrantedEffect;
  /** VISION only: the (x, y) actually revealed -- a nearby town's tile, or the waystation's own tile as a fallback. */
  revealedAtX?: number;
  revealedAtY?: number;
  /** TECH only: the tech id granted. (Pre-GOLD-fallback activations may have TECH with no id -- the old no-op.) */
  grantedTechId?: string;
  /** RESOURCE_SLOT only: which resource received the +1 slot bump. */
  grantedResource?: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";
  /** POPULATION only: the name of the town that received the burst. Absent if the player had no owned town nearby (silent no-op -- the tile still activates) or the town was unnamed. */
  grantedTownName?: string;
  /** POPULATION only: the (x, y) of the town that received the burst, so the client popup can offer a "Jump to Town" button. Absent under the same conditions as grantedTownName (no nearby owned town). */
  grantedTownX?: number;
  grantedTownY?: number;
  /** GOLD only: gold added to the player's treasury, and which flat tier it rolled. */
  grantedGold?: number;
  grantedGoldTier?: WaystationGoldTier;
  /** MANPOWER only: manpower added (may overflow the player's manpower cap). */
  grantedManpower?: number;
};
