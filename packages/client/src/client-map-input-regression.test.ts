import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mousePanThresholdPx, shouldCommitMouseSelection } from "./client-map-input.js";

const here = dirname(fileURLToPath(import.meta.url));

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

  it("commits loaded-tile selection on mousedown before drag handling", () => {
    const source = readFileSync(resolve(here, "./client-map-input.ts"), "utf8");
    expect(source).toContain("if (!boxSelectionMode && mousePanStartedOnLoadedTile) {");
    expect(source).toContain("mouseSelectionCommittedOnDown = true;");
    expect(source).toContain("deps.handleTileSelection(wx, wy, ev.clientX, ev.clientY);");
    expect(source).toContain("}) && !mouseSelectionCommittedOnDown) {");
  });

  it("keeps mobile tile selection on touchend after tap candidate survives", () => {
    const source = readFileSync(resolve(here, "./client-map-input.ts"), "utf8");
    expect(source).toContain("if (touchTapCandidate && !deps.interactionFlags.holdActivated && !pinchStart) {");
    expect(source).toContain("deps.handleTileSelection(wx, wy, touchTapCandidate.x, touchTapCandidate.y);");
  });
});
