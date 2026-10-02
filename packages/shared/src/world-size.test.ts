import { describe, expect, it } from "vitest";

import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH, WATCHTOWERS_ENABLED, WORLD_HEIGHT, WORLD_WIDTH } from "./world-size.js";

describe("world size env override", () => {
  it("defaults to the full 640x320 world with watchtowers when no env override is set", () => {
    expect(DEFAULT_WORLD_WIDTH).toBe(640);
    expect(DEFAULT_WORLD_HEIGHT).toBe(320);
    if (!process.env["WORLD_WIDTH"] && !process.env["WORLD_HEIGHT"]) {
      expect(WORLD_WIDTH).toBe(DEFAULT_WORLD_WIDTH);
      expect(WORLD_HEIGHT).toBe(DEFAULT_WORLD_HEIGHT);
    }
    if (process.env["WATCHTOWERS_ENABLED"] !== "false") expect(WATCHTOWERS_ENABLED).toBe(true);
  });
});
