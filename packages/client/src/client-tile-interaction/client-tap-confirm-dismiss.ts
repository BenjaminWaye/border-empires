// Closing the tile sheet cancels the pending confirm (select first, then
// confirm -- client-tile-interaction.ts). A selection the player dismissed
// (the sheet's X, Escape, back, opening another screen) must never spend on a
// later tap of the same tile.
//
// The sheet also closes as a side effect of the confirming press itself: the
// map's window mousedown hides it before the tap commits, and so does a press
// on the big confirm prompt. Those hides must keep the selection armed, so a
// hide counts as a dismissal unless it happens during a press that started on
// the map canvas or on the prompt. The press window is short and ends at once
// on a key press (Escape) or history navigation (back).

export const MAP_PRESS_WINDOW_MS = 1_000;

export type SheetDismissDisarm = {
  /** Call whenever the tile sheet closes: disarms unless the close came from a press on the map or the prompt. */
  sheetHidden: () => void;
};

export const isMapOrPromptPressTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLCanvasElement !== "undefined" && target instanceof HTMLCanvasElement) return true;
  return typeof Element !== "undefined" && target instanceof Element && target.closest(".tap-confirm-btn") !== null;
};

export const createSheetDismissDisarm = (deps: {
  win: Pick<Window, "addEventListener"> | undefined;
  disarm: () => void;
  isMapPress?: (target: EventTarget | null) => boolean;
  now?: () => number;
}): SheetDismissDisarm => {
  const now = deps.now ?? (() => Date.now());
  const isMapPress = deps.isMapPress ?? isMapOrPromptPressTarget;
  let mapPressAt = Number.NEGATIVE_INFINITY;
  const endPress = (): void => {
    mapPressAt = Number.NEGATIVE_INFINITY;
  };
  deps.win?.addEventListener("pointerdown", (ev) => {
    if (isMapPress(ev.target)) mapPressAt = now();
    else endPress();
  }, true);
  deps.win?.addEventListener("keydown", endPress, true);
  deps.win?.addEventListener("popstate", endPress, true);
  return {
    sheetHidden: () => {
      if (now() - mapPressAt > MAP_PRESS_WINDOW_MS) deps.disarm();
    }
  };
};
