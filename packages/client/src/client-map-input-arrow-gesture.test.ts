import { describe, expect, it } from "vitest";
import {
  cancelArrowGesture,
  createIdleArrowGestureState,
  isArrowGestureDragging,
  releaseArrowGesture,
  startArrowGesture,
  updateArrowGesture
} from "./client-map-input-arrow-gesture.js";

describe("client-map-input-arrow-gesture (F1 pure state machine)", () => {
  it("starts idle", () => {
    expect(createIdleArrowGestureState()).toEqual({ phase: "idle" });
  });

  it("start arms a drag at the origin, with current initialized to the origin", () => {
    const state = startArrowGesture({ x: 3, y: 4 });
    expect(state).toEqual({ phase: "dragging", origin: { x: 3, y: 4 }, current: { x: 3, y: 4 } });
    expect(isArrowGestureDragging(state)).toBe(true);
  });

  it("update moves the live current tile while dragging", () => {
    const dragging = startArrowGesture({ x: 0, y: 0 });
    const moved = updateArrowGesture(dragging, { x: 5, y: 5 });
    expect(moved).toEqual({ phase: "dragging", origin: { x: 0, y: 0 }, current: { x: 5, y: 5 } });
  });

  it("update is a no-op (same reference) when not dragging", () => {
    const idle = createIdleArrowGestureState();
    expect(updateArrowGesture(idle, { x: 1, y: 1 })).toBe(idle);
  });

  it("update returns the same reference when the current tile hasn't changed", () => {
    const dragging = startArrowGesture({ x: 2, y: 2 });
    expect(updateArrowGesture(dragging, { x: 2, y: 2 })).toBe(dragging);
  });

  it("release on a different tile fires a confirm with origin + target, and returns to idle", () => {
    const dragging = updateArrowGesture(startArrowGesture({ x: 1, y: 1 }), { x: 9, y: 9 });
    const { next, result } = releaseArrowGesture(dragging, { x: 9, y: 9 });
    expect(result).toEqual({ type: "confirm", origin: { x: 1, y: 1 }, target: { x: 9, y: 9 } });
    expect(next).toEqual({ phase: "idle" });
  });

  it("release back on the origin tile cancels instead of firing a zero-length arrow", () => {
    const dragging = startArrowGesture({ x: 4, y: 4 });
    const { next, result } = releaseArrowGesture(dragging, { x: 4, y: 4 });
    expect(result).toEqual({ type: "cancelled" });
    expect(next).toEqual({ phase: "idle" });
  });

  it("release while idle is a cancel, not a throw", () => {
    const { next, result } = releaseArrowGesture(createIdleArrowGestureState(), { x: 1, y: 1 });
    expect(result).toEqual({ type: "cancelled" });
    expect(next).toEqual({ phase: "idle" });
  });

  it("cancel always returns to idle", () => {
    const dragging = startArrowGesture({ x: 1, y: 1 });
    expect(cancelArrowGesture()).toEqual({ phase: "idle" });
    // Sanity: cancel doesn't depend on the passed-in state at all.
    void dragging;
  });
});
