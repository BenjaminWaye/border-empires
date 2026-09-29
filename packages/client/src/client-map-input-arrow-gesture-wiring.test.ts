// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { bindArrowGestureInput } from "./client-map-input-arrow-gesture-wiring.js";

// F5 (docs/replenishment-update-plan.md): persistence audit regressions --
// a right-click-drag arrow gesture used to have no cancel path for a
// backgrounded tab, a dropped WS connection, or the origin muster flag
// disappearing mid-drag (captured/destroyed by an opposing action). Each of
// these used to leave state.arrowGesture set (an arrow pointing from a tile
// that may no longer be the player's) with no event left to clear it.

const keyFor = (x: number, y: number): string => `${x},${y}`;

const buildDeps = (canvas: HTMLCanvasElement) => ({
  canvas,
  keyFor,
  worldTileFromPointer: (offsetX: number, offsetY: number) => ({ wx: offsetX, wy: offsetY }),
  pushFeed: () => {},
  sendGameMessage: () => true,
  renderHud: () => {}
});

const mouseDownAt = (canvas: HTMLCanvasElement, x: number, y: number, init: MouseEventInit = { button: 2 }): void => {
  const ev = new MouseEvent("mousedown", init);
  Object.defineProperty(ev, "offsetX", { value: x });
  Object.defineProperty(ev, "offsetY", { value: y });
  canvas.dispatchEvent(ev);
};

const mouseMoveAt = (canvas: HTMLCanvasElement, x: number, y: number): void => {
  const ev = new MouseEvent("mousemove");
  Object.defineProperty(ev, "offsetX", { value: x });
  Object.defineProperty(ev, "offsetY", { value: y });
  canvas.dispatchEvent(ev);
};

describe("bindArrowGestureInput (F5 orphaned-drag cancellation)", () => {
  it("cancels the drag when the origin tile's muster flag disappears mid-drag", () => {
    const canvas = document.createElement("canvas");
    const tiles = new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" as const }, ownerId: "me" }]]);
    const state = { me: "me", connection: "connected" as const, tiles, arrowGesture: undefined as unknown } as never;
    bindArrowGestureInput(state as never, buildDeps(canvas) as never);

    mouseDownAt(canvas, 1, 1);
    expect((state as { arrowGesture?: unknown }).arrowGesture).toBeDefined();

    // Origin flag captured/destroyed mid-drag: muster cleared.
    tiles.set("1,1", { x: 1, y: 1, muster: undefined, ownerId: "me" } as never);
    mouseMoveAt(canvas, 2, 2);

    expect((state as { arrowGesture?: unknown }).arrowGesture).toBeUndefined();
  });

  it("cancels the drag when the origin tile's ownership changes away from the local player mid-drag", () => {
    const canvas = document.createElement("canvas");
    const tiles = new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" as const }, ownerId: "me" }]]);
    const state = { me: "me", connection: "connected" as const, tiles, arrowGesture: undefined as unknown } as never;
    bindArrowGestureInput(state as never, buildDeps(canvas) as never);

    mouseDownAt(canvas, 1, 1);
    tiles.set("1,1", { x: 1, y: 1, muster: { mode: "HOLD" as const }, ownerId: "enemy" } as never);
    mouseMoveAt(canvas, 2, 2);

    expect((state as { arrowGesture?: unknown }).arrowGesture).toBeUndefined();
  });

  it("cancels the drag when the WS connection drops mid-drag", () => {
    const canvas = document.createElement("canvas");
    const tiles = new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" as const }, ownerId: "me" }]]);
    const state = { me: "me", connection: "connected" as const, tiles, arrowGesture: undefined as unknown } as never;
    bindArrowGestureInput(state as never, buildDeps(canvas) as never);

    mouseDownAt(canvas, 1, 1);
    (state as { connection: string }).connection = "disconnected";
    mouseMoveAt(canvas, 2, 2);

    expect((state as { arrowGesture?: unknown }).arrowGesture).toBeUndefined();
  });

  it("cancels an active drag when the tab is hidden (visibilitychange)", () => {
    const canvas = document.createElement("canvas");
    const tiles = new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" as const }, ownerId: "me" }]]);
    const state = { me: "me", connection: "connected" as const, tiles, arrowGesture: undefined as unknown } as never;
    bindArrowGestureInput(state as never, buildDeps(canvas) as never);

    mouseDownAt(canvas, 1, 1);
    expect((state as { arrowGesture?: unknown }).arrowGesture).toBeDefined();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect((state as { arrowGesture?: unknown }).arrowGesture).toBeUndefined();
  });

  it("cancels an active drag on window blur", () => {
    const canvas = document.createElement("canvas");
    const tiles = new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" as const }, ownerId: "me" }]]);
    const state = { me: "me", connection: "connected" as const, tiles, arrowGesture: undefined as unknown } as never;
    bindArrowGestureInput(state as never, buildDeps(canvas) as never);

    mouseDownAt(canvas, 1, 1);
    window.dispatchEvent(new Event("blur"));

    expect((state as { arrowGesture?: unknown }).arrowGesture).toBeUndefined();
  });
});

describe("bindArrowGestureInput (Mac trackpad ctrl+click arming)", () => {
  const setup = () => {
    const canvas = document.createElement("canvas");
    const tiles = new Map([["1,1", { x: 1, y: 1, muster: { mode: "HOLD" as const }, ownerId: "me" }]]);
    const state = { me: "me", connection: "connected" as const, tiles, arrowGesture: undefined as unknown };
    bindArrowGestureInput(state as never, buildDeps(canvas) as never);
    return { canvas, state };
  };

  it("arms on ctrl+left press of an owned flag (macOS reports ctrl+click as button 0)", () => {
    const { canvas, state } = setup();
    mouseDownAt(canvas, 1, 1, { button: 0, ctrlKey: true });
    expect(state.arrowGesture).toBeDefined();
  });

  it("does not stop a ctrl+left press from reaching the pan handler when it isn't on a flag", () => {
    const { canvas, state } = setup();
    let reached = false;
    canvas.addEventListener("mousedown", () => { reached = true; });
    mouseDownAt(canvas, 5, 5, { button: 0, ctrlKey: true });
    expect(state.arrowGesture).toBeUndefined();
    expect(reached).toBe(true);
  });

  it("a plain left press on a flag does not arm the gesture", () => {
    const { canvas, state } = setup();
    mouseDownAt(canvas, 1, 1, { button: 0 });
    expect(state.arrowGesture).toBeUndefined();
  });

  it("releases with the button that armed it", () => {
    const { canvas, state } = setup();
    mouseDownAt(canvas, 1, 1, { button: 0, ctrlKey: true });
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
    expect(state.arrowGesture).toBeUndefined();
  });
});
