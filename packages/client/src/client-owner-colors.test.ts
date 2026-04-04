import { describe, expect, it } from "vitest";
import { resolveOwnerColor } from "./client-owner-colors.js";

describe("resolveOwnerColor", () => {
  it("prefers the live player color over the hashed fallback", () => {
    const colors = new Map<string, string>([["nauticus", "#f59e0b"]]);
    expect(resolveOwnerColor("nauticus", colors, () => "#41d025")).toBe("#f59e0b");
  });

  it("falls back when the live player color is unavailable", () => {
    expect(resolveOwnerColor("unknown", new Map(), () => "#41d025")).toBe("#41d025");
  });
});
