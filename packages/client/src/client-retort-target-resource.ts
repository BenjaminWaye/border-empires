import type { RetortTargetResource } from "@border-empires/shared";

// Extracted from client-action-flow.ts (500-line source budget, see
// AGENTS.md) so a new recast target only adds one line there. actionId is a
// plain string here to match handleTileAction's own untyped parameter.
export const retortTargetResourceForAction = (actionId: string): RetortTargetResource | undefined => {
  if (actionId === "retort_recast_food") return "FARM";
  if (actionId === "retort_recast_titanium") return "TITANIUM";
  if (actionId === "retort_recast_crystal") return "GEMS";
  if (actionId === "retort_recast_umbrite") return "UMBRITE";
  return undefined;
};
