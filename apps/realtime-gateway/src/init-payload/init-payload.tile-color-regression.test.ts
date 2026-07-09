import { describe, expect, it } from "vitest";

import { hexColorForPlayerId } from "./init-payload.js";

describe("hexColorForPlayerId", () => {
  it("assigns barbarian ids the fixed dark grey instead of a hashed hue", () => {
    expect(hexColorForPlayerId("barbarian-1")).toBe("#2f3842");
    expect(hexColorForPlayerId("barbarian")).toBe("#2f3842");
  });

  it("assigns non-barbarian ids a deterministic hashed hex color", () => {
    const color = hexColorForPlayerId("player-1");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(hexColorForPlayerId("player-1")).toBe(color);
  });
});
