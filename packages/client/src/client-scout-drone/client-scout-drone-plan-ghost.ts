// The ghost leg under the pointer (true 3D, client-map-3d-scout-drone-plan-overlay.ts) needs a pointer
// that moved since the plan opened. The map's hover is the last tile the pointer was over, and a phone's
// tap sets it too, so a plan reopened after Cancel drew a leg to the old stop: "the old route reappeared
// when I opened Explore mode" (Playtest Run 5, d3-1540-explorer). Undo back to an empty plan counts as a
// reopen: the pointer is still on the stop just taken off.

type Point = { readonly x: number; readonly y: number };

/** A gate answering, each frame, whether the hover may draw the ghost leg. */
export const createScoutGhostHoverGate = (): ((planActive: boolean, stopCount: number, hover: Point | undefined) => boolean) => {
  let open = false;
  let stops = 0;
  let stale: string | undefined;
  return (planActive, stopCount, hover) => {
    const key = hover ? `${hover.x},${hover.y}` : "";
    if (!planActive) {
      open = false;
      return false;
    }
    if (!open || stopCount < stops) stale = key;
    open = true;
    stops = stopCount;
    if (stale !== undefined && key === stale) return false;
    stale = undefined;
    return Boolean(hover);
  };
};
