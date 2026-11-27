import { CREST_COSMETIC_IDS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { crestImage, crestSvgDataUrl, crestSvgDocument } from "./client-crest-image.js";
import { CREST_GLYPHS } from "./client-house-crest-art.js";

describe("crest images for the map", () => {
  it("are standalone SVG documents of the same glyph the HUD draws, in the requested colour", () => {
    for (const id of CREST_COSMETIC_IDS) {
      const doc = crestSvgDocument(id, "#ff0000");
      expect(doc).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(doc).toContain('fill="#ff0000"');
      expect(doc).toContain(CREST_GLYPHS[id]);
      expect(decodeURIComponent(crestSvgDataUrl(id, "#ff0000").split(",")[1] ?? "")).toBe(doc);
    }
  });

  it("draws nothing where there is no Image (a worker or test)", () => {
    expect(crestImage("crest-cog")).toBeUndefined();
  });
});
