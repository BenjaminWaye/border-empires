import { describe, expect, it } from "vitest";
import { isShieldCoverageShownOn } from "./client-known-shield-flags.js";

describe("isShieldCoverageShownOn", () => {
  const gesture = { origin: { x: 0, y: 0 }, target: { x: 1, y: 1 } };
  it("shows on enemy-owned tiles while dragging the arrow", () => {
    expect(isShieldCoverageShownOn(gesture, "enemy", "me")).toBe(true);
  });
  it("hides when no arrow is being dragged", () => {
    expect(isShieldCoverageShownOn(undefined, "enemy", "me")).toBe(false);
  });
  it("hides on own and unowned tiles", () => {
    expect(isShieldCoverageShownOn(gesture, "me", "me")).toBe(false);
    expect(isShieldCoverageShownOn(gesture, undefined, "me")).toBe(false);
  });
});
