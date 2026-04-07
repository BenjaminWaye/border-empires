import { describe, expect, it } from "vitest";
import { shouldCommitMouseSelection, shouldSelectLoadedTileOnMouseDown } from "./client-map-input.js";

describe("client map input regression guards", () => {
  it("selects a loaded tile on left mouse down instead of waiting for pan-capable click flow", () => {
    expect(
      shouldSelectLoadedTileOnMouseDown({
        button: 0,
        boxSelectionMode: false,
        hasPressedTile: true
      })
    ).toBe(true);
  });

  it("does not select on mouse down for empty space", () => {
    expect(
      shouldSelectLoadedTileOnMouseDown({
        button: 0,
        boxSelectionMode: false,
        hasPressedTile: false
      })
    ).toBe(false);
  });

  it("does not select on mouse down while box selection is active", () => {
    expect(
      shouldSelectLoadedTileOnMouseDown({
        button: 0,
        boxSelectionMode: true,
        hasPressedTile: true
      })
    ).toBe(false);
  });

  it("still allows regular mouse-up selection for empty-space click flows", () => {
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
