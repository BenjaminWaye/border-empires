// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { bindMinimapDrag } from "./client-minimap-drag.js";
import type { ClientState } from "../client-state/client-state.js";

const setup = (overrides: { onTap?: () => void; panOnPress?: () => boolean } = {}) => {
  const el = document.createElement("canvas");
  el.width = 200;
  el.height = 200;
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(el);
  const state = { camX: -1, camY: -1, camSubX: 0, camSubY: 0, tiles: new Map(), relicMapHints: new Map(), fogDisabled: true } as unknown as ClientState;
  bindMinimapDrag(state, {
    miniMapEl: el,
    wrapX: (x) => x,
    wrapY: (y) => y,
    requestViewRefresh: vi.fn(),
    maybeRefreshForCamera: vi.fn(),
    ...overrides
  });
  const mouse = (type: string, x: number, y: number, target: EventTarget = el, button = 0): boolean =>
    target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button }));
  return { el, state, mouse };
};

describe("minimap press", () => {
  it("opens the world map on a tap and leaves the camera where it was", () => {
    const onTap = vi.fn();
    const { state, mouse } = setup({ onTap });
    mouse("mousedown", 100, 100);
    mouse("mousemove", 102, 101, window);
    mouse("mouseup", 102, 101, window);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(state.camX).toBe(-1);
  });

  it("pans on a drag and does not open the world map", () => {
    const onTap = vi.fn();
    const { state, mouse } = setup({ onTap });
    mouse("mousedown", 100, 100);
    mouse("mousemove", 150, 100, window);
    mouse("mouseup", 150, 100, window);
    expect(onTap).not.toHaveBeenCalled();
    expect(state.camX).not.toBe(-1);
  });

  it("opens the world map on a touch tap too", () => {
    const onTap = vi.fn();
    const { el, state } = setup({ onTap });
    const touch = { clientX: 50, clientY: 50 } as Touch;
    el.dispatchEvent(Object.assign(new Event("touchstart"), { touches: [touch] }));
    el.dispatchEvent(Object.assign(new Event("touchend"), { touches: [] }));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(state.camX).toBe(-1);
  });

  it("cancels the browser's follow-up mouse events after a touch tap, so they cannot hit the opened map", () => {
    const onTap = vi.fn();
    const { el } = setup({ onTap });
    el.dispatchEvent(Object.assign(new Event("touchstart"), { touches: [{ clientX: 50, clientY: 50 } as Touch] }));
    const end = Object.assign(new Event("touchend", { cancelable: true }), { touches: [] });
    el.dispatchEvent(end);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(end.defaultPrevented).toBe(true);
  });

  it("leaves a touch drag's follow-up events alone", () => {
    const { el } = setup({ onTap: vi.fn() });
    el.dispatchEvent(Object.assign(new Event("touchstart"), { touches: [{ clientX: 50, clientY: 50 } as Touch] }));
    el.dispatchEvent(Object.assign(new Event("touchmove"), { touches: [{ clientX: 120, clientY: 50 } as Touch] }));
    const end = Object.assign(new Event("touchend", { cancelable: true }), { touches: [] });
    el.dispatchEvent(end);
    expect(end.defaultPrevented).toBe(false);
  });

  it("ignores a right-click", () => {
    const onTap = vi.fn();
    const { mouse } = setup({ onTap });
    mouse("mousedown", 100, 100, undefined, 2);
    mouse("mouseup", 100, 100, window, 2);
    expect(onTap).not.toHaveBeenCalled();
  });

  it("pans at once in the phone map overview, where a tap goes to the place", () => {
    const onTap = vi.fn();
    const { state, mouse } = setup({ onTap, panOnPress: () => true });
    mouse("mousedown", 100, 100);
    mouse("mouseup", 100, 100, window);
    expect(state.camX).not.toBe(-1);
    expect(onTap).not.toHaveBeenCalled();
  });
});
