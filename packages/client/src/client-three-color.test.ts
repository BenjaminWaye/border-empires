import { describe, expect, it } from "vitest";
import { normalizeColorForThree } from "./client-three-color.js";

describe("normalizeColorForThree", () => {
  it("passes hex colors through unchanged", () => {
    expect(normalizeColorForThree("#ff3344")).toBe("#ff3344");
  });

  it("converts modern hsl syntax to hex", () => {
    expect(normalizeColorForThree("hsl(0 100% 50%)")).toBe("#ff0000");
  });

  it("converts comma hsl syntax to hex", () => {
    expect(normalizeColorForThree("hsl(120, 100%, 25%)")).toBe("#008000");
  });

  it("converts rgb syntax to hex", () => {
    expect(normalizeColorForThree("rgb(255, 0, 0)")).toBe("#ff0000");
  });
});
