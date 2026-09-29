import { describe, expect, it } from "vitest";
import { arrowGestureConfirmInvalidatedByTileDeltaBatch } from "./client-arrow-gesture-confirm-invalidate.js";

// F5 (docs/replenishment-update-plan.md): persistence audit -- a fresh
// TILE_DELTA_BATCH landing while the arrow-gesture confirm sheet is open
// (client-arrow-gesture-confirm-sheet.ts) used to be ignored entirely, so an
// opposing capture of the armed origin flag left the sheet open still
// offering to SET_MUSTER a flag that's no longer the player's.

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("arrowGestureConfirmInvalidatedByTileDeltaBatch", () => {
  it("is false when there is no pending confirm", () => {
    const state = { me: "me", tiles: new Map(), pendingArrowGestureConfirm: undefined };
    expect(arrowGestureConfirmInvalidatedByTileDeltaBatch(state as never, [{ x: 1, y: 1 }], keyFor)).toBe(false);
  });

  it("is false when the batch doesn't touch the origin tile", () => {
    const state = {
      me: "me",
      tiles: new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" }, ownerId: "me" }]]),
      pendingArrowGestureConfirm: { origin: { x: 1, y: 1 }, target: { x: 5, y: 5 } }
    };
    expect(arrowGestureConfirmInvalidatedByTileDeltaBatch(state as never, [{ x: 9, y: 9 }], keyFor)).toBe(false);
  });

  it("is false when the origin tile's muster flag is still the player's after the batch", () => {
    const state = {
      me: "me",
      tiles: new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" }, ownerId: "me" }]]),
      pendingArrowGestureConfirm: { origin: { x: 1, y: 1 }, target: { x: 5, y: 5 } }
    };
    expect(arrowGestureConfirmInvalidatedByTileDeltaBatch(state as never, [{ x: 1, y: 1 }], keyFor)).toBe(false);
  });

  it("is true when the batch shows the origin tile captured by another player", () => {
    const state = {
      me: "me",
      tiles: new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" }, ownerId: "enemy" }]]),
      pendingArrowGestureConfirm: { origin: { x: 1, y: 1 }, target: { x: 5, y: 5 } }
    };
    expect(arrowGestureConfirmInvalidatedByTileDeltaBatch(state as never, [{ x: 1, y: 1 }], keyFor)).toBe(true);
  });

  it("is true when the batch shows the origin tile's muster flag gone (destroyed)", () => {
    const state = {
      me: "me",
      tiles: new Map([["1,1", { x: 1, y: 1, muster: undefined, ownerId: "me" }]]),
      pendingArrowGestureConfirm: { origin: { x: 1, y: 1 }, target: { x: 5, y: 5 } }
    };
    expect(arrowGestureConfirmInvalidatedByTileDeltaBatch(state as never, [{ x: 1, y: 1 }], keyFor)).toBe(true);
  });

  it("is false when only the target tile's ownership changes (target ownership is not invalidating)", () => {
    const state = {
      me: "me",
      tiles: new Map([
        ["1,1", { x: 1, y: 1, muster: { mode: "HOLD" }, ownerId: "me" }],
        ["5,5", { x: 5, y: 5, ownerId: "enemy" }]
      ]),
      pendingArrowGestureConfirm: { origin: { x: 1, y: 1 }, target: { x: 5, y: 5 } }
    };
    expect(arrowGestureConfirmInvalidatedByTileDeltaBatch(state as never, [{ x: 5, y: 5 }], keyFor)).toBe(false);
  });
});
