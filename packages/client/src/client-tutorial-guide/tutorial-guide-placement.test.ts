// @vitest-environment happy-dom
// Playtest 2026-11-28 (phone): on the right edge the guide's "?" (and card) sat on the
// Victory Race card, because the mirrored spot started at the same height as the left one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_SIDE_END_CLASS, guideCardOnEndSide, guideEndSideDrop, resetGuidePlacementForTests, syncGuideCardPlacement } from "./tutorial-guide-placement.js";

const rect = (left: number, top: number, right: number, bottom: number): DOMRect =>
  ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top }) as DOMRect;

describe("end side drops below the right-hand column (Victory Race)", () => {
  it("drops the end spot to just under the column, and not at all without one", () => {
    expect(guideEndSideDrop(100, { left: 200, top: 60, right: 370, bottom: 140 })).toBe(48);
    expect(guideEndSideDrop(100, { left: 200, top: 60, right: 370, bottom: 80 })).toBe(0);
    expect(guideEndSideDrop(100, undefined)).toBe(0);
  });

  it("judges the end spot at its dropped height, so the column it now clears doesn't count", () => {
    const card = { left: 10, top: 100, right: 260, bottom: 300 };
    const target = { left: 50, top: 150, right: 100, bottom: 200 };
    const column = { left: 280, top: 60, right: 370, bottom: 140 };
    expect(guideCardOnEndSide(card, false, 375, [target, column])).toBe(false);
    expect(guideCardOnEndSide(card, false, 375, [target, column], 48)).toBe(true);
  });

  describe("live, on the phone layout", () => {
    let root: HTMLElement;
    let column: HTMLElement;
    let rootHidden = false;
    const sync = (nowMs: number): void => {
      resetGuidePlacementForTests();
      syncGuideCardPlacement([], undefined, nowMs);
    };
    beforeEach(() => {
      rootHidden = false;
      resetGuidePlacementForTests();
      document.body.className = "hud-v2-compact scout-focus";
      root = document.createElement("div");
      root.id = "tutorial-guide-root";
      root.className = GUIDE_SIDE_END_CLASS;
      // During a drone flight the card is hidden by CSS and only the "?" launcher shows.
      root.innerHTML = `<div class="tg-card"></div><button class="tg-launcher">?</button>`;
      column = document.createElement("div");
      column.className = "hud-v2-right";
      document.body.append(root, column);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        // Like the compact CSS: on the end side the root sits --tg-end-drop lower (margin-top); hidden, it has no box.
        if (this === root) {
          if (rootHidden) return rect(0, 0, 0, 0);
          const drop = root.classList.contains(GUIDE_SIDE_END_CLASS) ? parseFloat(root.style.getPropertyValue("--tg-end-drop")) || 0 : 0;
          return rect(325, 204 + drop, 365, 244 + drop);
        }
        if (this === column) return rect(213, 159, 369, 236);
        return rect(0, 0, 0, 0);
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
      document.body.innerHTML = "";
      document.body.className = "";
    });

    it("sets the drop that puts the folded ? under the Victory Race card", () => {
      syncGuideCardPlacement([], undefined, 0);
      expect(root.classList.contains(GUIDE_SIDE_END_CLASS)).toBe(true);
      expect(root.style.getPropertyValue("--tg-end-drop")).toBe("40px");
    });

    it("keeps the same drop on later syncs once the root has moved down by it", () => {
      sync(0);
      sync(1000);
      sync(2000);
      expect(root.style.getPropertyValue("--tg-end-drop")).toBe("40px");
    });

    it("keeps the last drop while the guide is hidden, instead of growing it every sync", () => {
      sync(0);
      rootHidden = true; // e.g. a tracker line or a sheet is open
      sync(1000);
      sync(2000);
      expect(root.style.getPropertyValue("--tg-end-drop")).toBe("40px");
      rootHidden = false;
      sync(3000);
      expect(root.style.getPropertyValue("--tg-end-drop")).toBe("40px");
    });

    it("sets no drop outside the phone layout", () => {
      document.body.className = "";
      syncGuideCardPlacement([], undefined, 0);
      expect(root.style.getPropertyValue("--tg-end-drop")).toBe("");
    });
  });
});
