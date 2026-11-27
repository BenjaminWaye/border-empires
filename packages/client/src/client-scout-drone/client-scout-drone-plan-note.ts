// The one line of words over the scout dock (client-scout-drone-dock.ts) saying why the plan is not
// what the player tapped. A bare "Blocked", and stops that jumped to other tiles, left the rules
// hidden until a later flight's toast named the border (Playtest Run 5, d3-1540-explorer):
// - "Blocked · Rosa's Garden II border": a rival border right past home ends the route before any fog;
// - "Stop moved · Rosa's Garden II border": a stop was pulled back short of a rival border;
// - "Stop moved · range limit": a stop was past the leg's range and pulled back to its edge.
// The rules themselves are unchanged (packages/shared/src/scout-drone/scout-drone-route.ts).
import { scoutDroneRouteDeadEnd } from "@border-empires/shared";
import type { ScoutPlanPreview } from "./client-scout-drone-plan.js";

type Point = { readonly x: number; readonly y: number };

/** "Rosa's Garden II border", or "rival border" when the owner's name is unknown. */
const borderLabel = (ownerId: string | undefined, nameOf: (playerId: string) => string | undefined): string => {
  const name = ownerId ? nameOf(ownerId) : undefined;
  return name ? `${name} border` : "rival border";
};

/**
 * The dock's note for a plan whose tapped stops are `tapped` and whose route is `preview`, or undefined when
 * every stop is where the player put it. The latest moved stop speaks: it is the one the player just placed.
 */
export const scoutPlanNote = (preview: ScoutPlanPreview | undefined, tapped: readonly Point[], nameOf: (playerId: string) => string | undefined): string | undefined => {
  if (!preview) return undefined;
  const legs = preview.route.legs;
  if (scoutDroneRouteDeadEnd(preview.route)) return `Blocked · ${borderLabel(legs.at(-1)?.blocked?.ownerId, nameOf)}`;
  for (let i = legs.length - 1; i >= 0; i -= 1) {
    const leg = legs[i]!;
    const want = tapped[i];
    if (!want || (leg.end.x === want.x && leg.end.y === want.y)) continue;
    if (leg.blocked) return `Stop moved · ${borderLabel(leg.blocked.ownerId, nameOf)}`;
    if (leg.clamped) return "Stop moved · range limit";
  }
  return undefined;
};
