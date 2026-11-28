// "Show me" on a map target (the tutorial guide's Show me, a discovery tip's
// show) moves the camera, but a full-screen HUD view (Manifests, Diplomacy,
// the town screen) or, on a phone, a hosted side panel can be covering the map
// at the time, so the move happened unseen. First-15 playtest 2026-11-28: "Show
// me did nothing while I had Manifest open".
//
// The camera code doesn't know the HUD, so it only asks: the HUD's frame takes
// the ask and closes what covers the map, keeping the view the camera was just
// given (a town close-up would otherwise glide back on close). Camera state is
// shared by the 2D and true-3D renderers, so neither needs its own handling.

let requested = false;

/** Ask the HUD to uncover the map on its next frame. */
export const requestHudV2MapReveal = (): void => {
  requested = true;
};

/** Read once: whether a reveal was asked for since the last call. */
export const takeHudV2MapReveal = (): boolean => {
  const was = requested;
  requested = false;
  return was;
};

export type MapRevealContext = {
  /** A full-screen HUD view is open. */
  screenOpen: boolean;
  /** Closes that view and puts the current camera back (closeScreenKeepingView). */
  closeScreenKeepingView: () => void;
  /** A side panel is open; on a phone it covers the map. */
  panelOpen: boolean;
  compact: boolean;
  closePanel: () => void;
};

/** Applies a pending reveal; true when one was pending. */
export const applyHudV2MapReveal = (ctx: MapRevealContext): boolean => {
  if (!takeHudV2MapReveal()) return false;
  if (ctx.screenOpen) ctx.closeScreenKeepingView();
  if (ctx.compact && ctx.panelOpen) ctx.closePanel();
  return true;
};
