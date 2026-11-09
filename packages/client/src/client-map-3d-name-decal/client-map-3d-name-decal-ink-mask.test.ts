import { describe, expect, it } from "vitest";
import { drawNameAlongPath, type LabelStyle } from "../client-map-name-labels/client-map-name-label-draw.js";
import { labelInkMask, type InkMaskLabel } from "./client-map-3d-name-decal-ink-mask.js";

const area = { x0: 100, y0: 200, widthTiles: 60, heightTiles: 40 };
const maxFont = (kind: InkMaskLabel["kind"]): number => (kind === "player" ? 7 : 3.5);
const label = (points: Array<{ x: number; y: number }>, spanTiles = 4, heightTiles = 1): InkMaskLabel => ({
  kind: "island",
  path: { text: "Isle", points, spanTiles, heightTiles }
});

describe("labelInkMask", () => {
  it("covers nothing without labels", () => {
    const mask = labelInkMask([], area, 450, 450, maxFont);
    expect(mask.key).toBe("");
    expect(mask.covers(30, 20)).toBe(false);
  });

  it("covers the path, the half-span overshoot past its ends and the glyph height, but not the far window", () => {
    // Area-local path from (20, 20) to (24, 20) -- a 4-tile name with a 4-tile span.
    const mask = labelInkMask([label([{ x: 120, y: 220 }, { x: 124, y: 220 }])], area, 450, 450, maxFont);
    for (let x = 18; x <= 26; x += 1) expect(mask.covers(x, 20)).toBe(true); // the run, incl. overshoot along the end tangents
    expect(mask.covers(22, 18)).toBe(true); // glyph above the path
    expect(mask.covers(22, 22)).toBe(true); // glyph below the path
    expect(mask.covers(0, 0)).toBe(false);
    expect(mask.covers(40, 20)).toBe(false);
    expect(mask.covers(22, 30)).toBe(false);
  });

  it("follows the toroidal wrap of a label across the world seam", () => {
    const seamArea = { x0: 440, y0: 0, widthTiles: 30, heightTiles: 20 };
    const mask = labelInkMask([label([{ x: 2, y: 10 }, { x: 4, y: 10 }])], seamArea, 450, 450, maxFont);
    expect(mask.covers(13, 10)).toBe(true); // world x 3 sits 13 tiles east of x0 = 440
    expect(mask.covers(0, 10)).toBe(false);
  });

  it("clamps rectangles to the area and never reports tiles outside it", () => {
    const mask = labelInkMask([label([{ x: 100, y: 200 }, { x: 101, y: 200 }], 10, 5)], area, 450, 450, maxFont);
    expect(mask.covers(0, 0)).toBe(true);
    expect(mask.covers(-1, 0)).toBe(false);
    expect(mask.covers(60, 0)).toBe(false);
  });

  it("changes key only when the covered rectangles change", () => {
    const a = labelInkMask([label([{ x: 120, y: 220 }, { x: 124, y: 220 }])], area, 450, 450, maxFont);
    const b = labelInkMask([label([{ x: 120, y: 220 }, { x: 124, y: 220 }])], area, 450, 450, maxFont);
    const c = labelInkMask([label([{ x: 130, y: 220 }, { x: 134, y: 220 }])], area, 450, 450, maxFont);
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });

  // Guards the bound itself: every glyph drawNameAlongPath actually paints
  // (centre +- one glyph height, which covers a rotated glyph and its halo)
  // must land on a covered tile, including names longer than their path.
  it("covers every glyph drawNameAlongPath paints", () => {
    const pxPerTile = 10;
    const glyphs: Array<{ x: number; y: number; fontPx: number }> = [];
    let fontPx = 0;
    let tx = 0;
    let ty = 0;
    const ctx = {
      save: () => undefined, restore: () => undefined, rotate: () => undefined, strokeText: () => undefined,
      set font(value: string) { fontPx = Number.parseFloat(value); }, get font() { return `${fontPx}px x`; },
      measureText: () => ({ width: 0.6 * fontPx }),
      translate: (x: number, y: number) => { tx = x; ty = y; },
      fillText: () => { glyphs.push({ x: tx, y: ty, fontPx }); }
    } as unknown as CanvasRenderingContext2D;
    const style: LabelStyle = { font: (px) => `${px}px x`, fill: "#000", stroke: "#fff", alpha: 1, maxSpacingEm: 3, minFontPx: 0.3 * pxPerTile, maxFontPx: 3.5 * pxPerTile, strokeEm: 0.16 };
    const labels = [
      label([{ x: 120, y: 220 }, { x: 121, y: 221 }], 12, 3), // name far longer than its path
      label([{ x: 130, y: 210 }, { x: 134, y: 212 }, { x: 138, y: 210 }], 8, 2),
      {
        kind: "player",
        // The projection's antipodal cut stretches this two-tile path across the canvas.
        path: { text: "É", points: [{ x: 324.5, y: 220 }, { x: 326.5, y: 220 }], spanTiles: 2, heightTiles: 0.45 }
      } satisfies InkMaskLabel
    ];
    const offsetPx = (delta: number): number => ((((delta + 225) % 450 + 450) % 450) - 225 + 0.5) * pxPerTile;
    const project = (wx: number, wy: number) => ({ sx: offsetPx(wx - area.x0), sy: offsetPx(wy - area.y0) });
    for (const entry of labels) {
      const { path, kind } = entry;
      const mask = labelInkMask([entry], area, 450, 450, maxFont);
      glyphs.length = 0;
      expect(drawNameAlongPath(ctx, path, { ...style, maxFontPx: maxFont(kind) * pxPerTile }, project, { width: 600, height: 400 })).toBe(true);
      expect(glyphs.length).toBeGreaterThan(0);
      for (const glyph of glyphs) {
        const reach = glyph.fontPx / pxPerTile;
        for (const [dx, dy] of [[-reach, -reach], [reach, -reach], [-reach, reach], [reach, reach], [0, 0]] as const) {
          const x = Math.floor(glyph.x / pxPerTile + dx);
          const y = Math.floor(glyph.y / pxPerTile + dy);
          if (x >= 0 && x < area.widthTiles && y >= 0 && y < area.heightTiles) expect(mask.covers(x, y)).toBe(true);
        }
      }
    }
  });
});
