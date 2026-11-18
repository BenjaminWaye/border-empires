// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createTapConfirm } from "./client-tile-interaction.js";
import { createSheetDismissDisarm, MAP_PRESS_WINDOW_MS } from "./client-tap-confirm-dismiss.js";

// Coordinator follow-up on PR #2848: closing the sheet (X, back, opening any
// screen) must cancel the pending confirm, so a dismissed selection never
// spends on a later tap of the same tile.
const setup = () => {
  let clock = 1_000;
  const tap = createTapConfirm();
  const dismiss = createSheetDismissDisarm({ win: window, disarm: tap.disarm, now: () => clock });
  const canvas = document.createElement("canvas");
  const closeX = document.createElement("button");
  const prompt = document.createElement("button");
  prompt.className = "tap-confirm-btn";
  document.body.append(canvas, closeX, prompt);
  const press = (el: Element): void => {
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  };
  return { tap, dismiss, canvas, closeX, prompt, press, advance: (ms: number) => (clock += ms) };
};

describe("closing the tile sheet disarms the pending confirm", () => {
  it("the sheet's X (or any other screen's button) disarms: the next tap on the tile only selects", () => {
    const { tap, dismiss, closeX, press } = setup();
    tap.arm(4, 5);
    press(closeX);
    dismiss.sheetHidden();
    expect(tap.take(4, 5)).toBe(false);
  });

  it("Escape or back after the selecting tap disarms", () => {
    const { tap, dismiss, canvas, press } = setup();
    press(canvas);
    tap.arm(4, 5);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    dismiss.sheetHidden();
    expect(tap.take(4, 5)).toBe(false);

    press(canvas);
    tap.arm(4, 5);
    window.dispatchEvent(new Event("popstate"));
    dismiss.sheetHidden();
    expect(tap.take(4, 5)).toBe(false);
  });

  it("a close with no press at all (programmatic) disarms", () => {
    const { tap, dismiss, canvas, press, advance } = setup();
    press(canvas);
    tap.arm(4, 5);
    advance(MAP_PRESS_WINDOW_MS + 1);
    dismiss.sheetHidden();
    expect(tap.take(4, 5)).toBe(false);
  });

  it("the sheet closing because the player pressed the map or the prompt keeps the selection armed", () => {
    const { tap, dismiss, canvas, prompt, press } = setup();
    tap.arm(4, 5);
    press(canvas); // the second tap: the map hides the sheet on press, before the tap commits
    dismiss.sheetHidden();
    expect(tap.take(4, 5)).toBe(true);

    tap.arm(4, 5);
    press(prompt);
    dismiss.sheetHidden();
    expect(tap.take(4, 5)).toBe(true);
  });
});
