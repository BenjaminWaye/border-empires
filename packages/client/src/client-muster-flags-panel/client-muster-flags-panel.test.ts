// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { buildManpowerPanelMusterFlags, wireMusterFocusButtons } from "./client-muster-flags-panel.js";
import type { Tile } from "../client-types.js";

const tile = (overrides: Omit<Partial<Tile>, "muster"> & { muster?: Partial<NonNullable<Tile["muster"]>> } = {}): Tile => {
  const { muster: musterOverrides, ...tileOverrides } = overrides;
  return {
    x: 5,
    y: 6,
    terrain: "LAND",
    ownerId: "me",
    ownershipState: "SETTLED",
    ...tileOverrides,
    muster: {
      ownerId: "me",
      amount: 50,
      mode: "HOLD",
      updatedAt: 0,
      ...musterOverrides
    }
  };
};

describe("buildManpowerPanelMusterFlags", () => {
  it("includes only muster flags owned by the given player", () => {
    const flags = buildManpowerPanelMusterFlags(
      [tile(), tile({ x: 7, y: 8, muster: { ownerId: "enemy" } })],
      "me"
    );
    expect(flags).toEqual([{ x: 5, y: 6, amount: 50, mode: "HOLD", targetX: undefined, targetY: undefined }]);
  });

  it("returns an empty list when no tiles have a muster flag", () => {
    expect(buildManpowerPanelMusterFlags([{ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile], "me")).toEqual([]);
  });

  it("carries advance target coordinates through", () => {
    const flags = buildManpowerPanelMusterFlags([tile({ muster: { mode: "ADVANCE", targetX: 9, targetY: 10 } })], "me");
    expect(flags).toEqual([{ x: 5, y: 6, amount: 50, mode: "ADVANCE", targetX: 9, targetY: 10 }]);
  });
});

describe("wireMusterFocusButtons", () => {
  it("navigates the camera to the button's coordinates on click", () => {
    document.body.innerHTML = `<button data-muster-focus-x="12" data-muster-focus-y="18"></button>`;
    const state = { camX: 0, camY: 0, selected: undefined as { x: number; y: number } | undefined };
    let refreshed = false;
    let rerendered = false;
    wireMusterFocusButtons(document.body, state, {
      wrapX: (x) => x,
      wrapY: (y) => y,
      requestViewRefresh: () => { refreshed = true; },
      rerender: () => { rerendered = true; }
    });
    (document.querySelector("button") as HTMLButtonElement).click();
    expect(state.camX).toBe(12);
    expect(state.camY).toBe(18);
    expect(state.selected).toEqual({ x: 12, y: 18 });
    expect(refreshed).toBe(true);
    expect(rerendered).toBe(true);
  });

  it("ignores clicks with non-numeric coordinates", () => {
    document.body.innerHTML = `<button data-muster-focus-x="nope" data-muster-focus-y="18"></button>`;
    const state = { camX: 1, camY: 2, selected: undefined as { x: number; y: number } | undefined };
    wireMusterFocusButtons(document.body, state, {
      wrapX: (x) => x,
      wrapY: (y) => y,
      requestViewRefresh: () => undefined,
      rerender: () => undefined
    });
    (document.querySelector("button") as HTMLButtonElement).click();
    expect(state.camX).toBe(1);
    expect(state.camY).toBe(2);
  });
});
