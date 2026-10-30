import { describe, expect, it } from "vitest";
import { createFlagTapTracker, type FlagTapView } from "./client-hud-v2-flag-tap.js";

const TOWN = "5,5";
const flaggedTown = (tapPress: number | undefined, townScreenOpen = false): FlagTapView => ({ tileKey: TOWN, flagged: true, inTown: true, tapPress, townScreenOpen });

// With a mouse, a press on the map hides the menu on mousedown and the tap that press ends re-renders it.
const tapTown = (tracker: ReturnType<typeof createFlagTapTracker>, press: number, menuOpen: boolean): boolean => {
  if (menuOpen) tracker.onHidden(press);
  return tracker.onView(flaggedTown(press));
};

// Regression: tapping a town (or support tile) with a muster flag on it always opened the town screen and
// zoomed in, so updating the flag's orders meant zooming in on the town every time.
describe("tapping a town tile that carries a muster flag", () => {
  it("selects the flag on the first tap and opens the town screen on the second", () => {
    const tracker = createFlagTapTracker();
    expect(tapTown(tracker, 1, false)).toBe(false);
    expect(tracker.onView(flaggedTown(undefined))).toBe(false);
    expect(tapTown(tracker, 2, true)).toBe(true);
  });

  it("still opens the town screen straight away when there is no flag", () => {
    const tracker = createFlagTapTracker();
    expect(tracker.onView({ tileKey: TOWN, flagged: false, inTown: true, tapPress: 1, townScreenOpen: false })).toBe(true);
  });

  it("keeps the town screen open through re-renders", () => {
    const tracker = createFlagTapTracker();
    expect(tracker.onView(flaggedTown(undefined, true))).toBe(true);
  });

  // Regression: closing the tile bar after the first tap left that tap pending, so the next tap on the tile
  // zoomed straight into the town screen.
  it("starts over after the bar is closed with ✕ or Esc, however soon the next tap comes", () => {
    const tracker = createFlagTapTracker();
    tapTown(tracker, 1, false);
    tracker.onHidden(undefined);
    expect(tapTown(tracker, 2, false)).toBe(false);
    expect(tapTown(tracker, 3, true)).toBe(true);
  });

  // Regression (review): a 700 ms timer dropped the second tap of a slow click, since the menu hides on
  // mousedown and only reopens on mouseup.
  it("counts a slow second click, however long the button is held", () => {
    const tracker = createFlagTapTracker();
    tapTown(tracker, 1, false);
    tracker.onHidden(2);
    expect(tracker.onView(flaggedTown(2))).toBe(true);
  });

  it("starts over when the press that hid the bar was a pan, not a tap", () => {
    const tracker = createFlagTapTracker();
    tapTown(tracker, 1, false);
    tracker.onHidden(2);
    expect(tapTown(tracker, 3, false)).toBe(false);
  });

  it("does not revive a closed bar's tap when a later press hides the already-hidden menu again", () => {
    const tracker = createFlagTapTracker();
    tapTown(tracker, 1, false);
    tracker.onHidden(undefined);
    expect(tapTown(tracker, 2, true)).toBe(false);
  });

  it("needs two taps again after tapping another tile", () => {
    const tracker = createFlagTapTracker();
    tapTown(tracker, 1, false);
    tracker.onHidden(2);
    tracker.onView({ tileKey: "9,9", flagged: false, inTown: false, tapPress: 2, townScreenOpen: false });
    expect(tapTown(tracker, 3, true)).toBe(false);
  });
});
