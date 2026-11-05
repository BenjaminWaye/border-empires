// Tap state for a town or support tile carrying your muster flag (HUD v2): the
// first tap selects the flag (plain tile bar, no close-up), a second tap on it
// opens the town screen. Kept as a small state machine apart from the town
// screen runtime so the whole tap / close / re-tap sequence is testable.

/**
 * What a menu render looks like to the tracker. `tapPress` is the map press
 * (see client-hud-v2-tile-dock.ts) whose tap caused this render, or undefined
 * when the render is not the first after a tap (a re-render, a programmatic
 * open).
 */
export type FlagTapView = {
  tileKey: string;
  /** Your own town or support tile with a muster flag on it. */
  flagged: boolean;
  /** The tile belongs to one of your towns (the town screen could take it). */
  inTown: boolean;
  tapPress: number | undefined;
  townScreenOpen: boolean;
};

export type FlagTapTracker = {
  /**
   * The tile bar was hidden. `byMapPress` is the map press that hid it (the
   * map hides the menu on mousedown), or undefined for any other close: ✕,
   * Esc, a press on the HUD.
   */
  onHidden: (byMapPress: number | undefined) => void;
  /** Returns whether the town screen should take this render. */
  onView: (view: FlagTapView) => boolean;
};

export const createFlagTapTracker = (): FlagTapTracker => {
  /** The flagged tile the last tap selected as a flag, so tapping it again opens the town screen. */
  let pendingKey: string | undefined;
  /** The map press that hid the bar since the last render, if a map press hid it. */
  let hiddenByPress: number | undefined;
  return {
    onHidden: (byMapPress) => {
      // Closed by the player (not by pressing the map): the next tap on the
      // tile starts over and only selects the flag again.
      if (byMapPress === undefined) pendingKey = undefined;
      hiddenByPress = byMapPress;
    },
    onView: (view) => {
      // A press on the map hid the bar but this render isn't that press's tap
      // (it was a pan, or the tap went elsewhere first): start over.
      if (hiddenByPress !== undefined && view.tapPress !== hiddenByPress) pendingKey = undefined;
      hiddenByPress = undefined;
      const tap = view.tapPress !== undefined;
      if (!view.inTown) {
        if (tap) pendingKey = undefined;
        return false;
      }
      if (!view.flagged) {
        if (tap) pendingKey = undefined;
        return true;
      }
      if (tap) {
        if (pendingKey === view.tileKey) {
          pendingKey = undefined;
          return true;
        }
        pendingKey = view.tileKey;
        return false;
      }
      return view.townScreenOpen;
    }
  };
};
