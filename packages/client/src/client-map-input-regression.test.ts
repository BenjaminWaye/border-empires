import { describe, expect, it } from "vitest";
import { mousePanThresholdPx, shouldCommitMouseSelection } from "./client-map-input.js";

describe("client map input regression guards", () => {
  it("requires a larger drag threshold when the mouse down starts on a loaded tile", () => {
    expect(mousePanThresholdPx(true)).toBe(Number.POSITIVE_INFINITY);
    expect(mousePanThresholdPx(false)).toBe(4);
  });

  it("still commits normal left-click tile selection when no pan occurred", () => {
    expect(
      shouldCommitMouseSelection({
        button: 0,
        boxSelectionMode: false,
        boxSelectionEngaged: false,
        mousePanMoved: false
      })
    ).toBe(true);
  });
});
