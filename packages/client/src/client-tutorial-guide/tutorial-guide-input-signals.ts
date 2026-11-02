// Player-input signals for the guide's "Look around" chapter. Set from the
// shared map input binding (client-map-input.ts), which both the 2D canvas
// and the true-3D renderer use, so a drag/zoom/tap counts the same in either.
// Programmatic camera moves (Center, AFC drop, alert jumps) never set these:
// only the player's own gestures do.

const signals = { panned: false, zoomed: false, tileSelected: false };

export type GuideInputSignals = Readonly<typeof signals>;

export const noteGuideMapPanned = (): void => {
  signals.panned = true;
};

export const noteGuideMapZoomed = (): void => {
  signals.zoomed = true;
};

export const noteGuideTileSelected = (): void => {
  signals.tileSelected = true;
};

export const guideInputSignals = (): GuideInputSignals => signals;

/** Test-only. */
export const resetGuideInputSignalsForTests = (): void => {
  signals.panned = false;
  signals.zoomed = false;
  signals.tileSelected = false;
};
