import { describe, expect, it } from "vitest";

import { tileDeltaTouchesOpenTileMenu } from "./client-tile-menu-delta-refresh.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("tileDeltaTouchesOpenTileMenu", () => {
  it("returns true when a TILE_DELTA update matches the currently open single-tile menu", () => {
    const state = { tileActionMenu: { visible: true, mode: "single" as const, currentTileKey: "5,6" } };
    expect(tileDeltaTouchesOpenTileMenu(state, [{ x: 1, y: 1 }, { x: 5, y: 6 }], keyFor)).toBe(true);
  });

  it("returns false when no update in the batch matches the open tile", () => {
    const state = { tileActionMenu: { visible: true, mode: "single" as const, currentTileKey: "5,6" } };
    expect(tileDeltaTouchesOpenTileMenu(state, [{ x: 1, y: 1 }], keyFor)).toBe(false);
  });

  it("returns false when no menu is open", () => {
    const state = { tileActionMenu: { visible: false, mode: "single" as const, currentTileKey: "5,6" } };
    expect(tileDeltaTouchesOpenTileMenu(state, [{ x: 5, y: 6 }], keyFor)).toBe(false);
  });

  it("returns false for a bulk menu, since only single-tile menus render a live progress countdown", () => {
    const state = { tileActionMenu: { visible: true, mode: "bulk" as const, currentTileKey: "5,6" } };
    expect(tileDeltaTouchesOpenTileMenu(state, [{ x: 5, y: 6 }], keyFor)).toBe(false);
  });

  it("does not throw when tileActionMenu is undefined on a partial state object", () => {
    const state = { tileActionMenu: undefined as unknown as { visible: boolean; mode: "single" | "bulk"; currentTileKey: string } };
    expect(tileDeltaTouchesOpenTileMenu(state, [{ x: 5, y: 6 }], keyFor)).toBe(false);
  });
});
