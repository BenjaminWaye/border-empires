import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("hidden nav button style regression", () => {
  it("keeps an explicit [hidden] override for .icon-btn.icon-only so hidden nav buttons cannot be shown by its display:grid rule", () => {
    const source = readFileSync(new URL("../style.css", import.meta.url), "utf8");

    expect(source).toContain(".icon-btn.icon-only[hidden]");
  });
});
