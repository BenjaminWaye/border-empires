import { describe, expect, it } from "vitest";
import { applyIslandNamesMessage, createInitialIslandNamesState } from "./client-island-names-state.js";
import { drawNameAlongPath } from "./client-map-name-label-draw.js";
import { islandLabelPath, nameLabelAlphasForZoom } from "./client-map-name-labels.js";

const fakeCtx = () => {
  const glyphs: Array<{ char: string; x: number; y: number }> = [];
  let tx = 0;
  let ty = 0;
  const stack: Array<[number, number]> = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    font: "",
    globalAlpha: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    lineJoin: "miter",
    lineWidth: 1,
    strokeStyle: "",
    fillStyle: "",
    measureText: (text: string) => ({ width: text.length * 60 }),
    save: () => { stack.push([tx, ty]); },
    restore: () => { [tx, ty] = stack.pop() ?? [0, 0]; },
    translate: (x: number, y: number) => { tx += x; ty += y; },
    rotate: () => {},
    strokeText: () => {},
    fillText: (char: string) => { glyphs.push({ char, x: tx, y: ty }); }
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, glyphs };
};

describe("nameLabelAlphasForZoom", () => {
  it("shows player names fully zoomed out and island names zoomed in, crossfading between", () => {
    expect(nameLabelAlphasForZoom(10)).toEqual({ players: 1, islands: 0 });
    expect(nameLabelAlphasForZoom(22)).toEqual({ players: 0, islands: 1 });
    const mid = nameLabelAlphasForZoom(16);
    expect(mid.players).toBeCloseTo(0.5);
    expect(mid.islands).toBeCloseTo(0.5);
  });
});

describe("applyIslandNamesMessage", () => {
  it("keeps well-formed labels and drops malformed ones", () => {
    const state = createInitialIslandNamesState();
    expect(applyIslandNamesMessage(state, { islands: "nope" })).toBe(false);
    expect(state.islandLabels).toBeUndefined();
    applyIslandNamesMessage(state, {
      islands: [
        { id: "1,2", x: 3, y: 4, angle: 0, span: 10, thickness: 4, name: "Isle of Brass", status: "held", namerId: "p1" },
        { id: "bad", x: "3", y: 4, angle: 0, span: 10, thickness: 4, name: "Nope" }
      ]
    });
    expect(state.islandLabels).toEqual([{ id: "1,2", x: 3, y: 4, angle: 0, span: 10, thickness: 4, name: "Isle of Brass", status: "held", namerId: "p1" }]);
  });
});

describe("drawNameAlongPath", () => {
  const project = (wx: number, wy: number) => ({ sx: wx * 10, sy: wy * 10 });

  it("spreads letters across a long path, left to right, centred on it", () => {
    const { ctx, glyphs } = fakeCtx();
    const drawn = drawNameAlongPath(
      ctx,
      { text: "ABC", points: [{ x: 40, y: 20 }, { x: 10, y: 20 }], heightTiles: 2, spanTiles: 32 },
      { font: (px) => `${px}px serif`, fill: "#fff", stroke: "#000", alpha: 1, maxSpacingEm: 10, minFontPx: 8, maxFontPx: 200 },
      project,
      { width: 800, height: 600 }
    );
    expect(drawn).toBe(true);
    expect(glyphs.map((glyph) => glyph.char)).toEqual(["A", "B", "C"]);
    expect(glyphs[0]!.x).toBeLessThan(glyphs[2]!.x);
    expect((glyphs[0]!.x + glyphs[2]!.x) / 2).toBeCloseTo(250, 0);
    expect(glyphs[2]!.x - glyphs[0]!.x).toBeGreaterThan(150);
  });

  it("draws nothing when invisible or far off-screen", () => {
    const { ctx, glyphs } = fakeCtx();
    const style = { font: (px: number) => `${px}px serif`, fill: "#fff", stroke: "#000", alpha: 1, maxSpacingEm: 1, minFontPx: 8, maxFontPx: 200 };
    expect(drawNameAlongPath(ctx, { text: "A", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], heightTiles: 1, spanTiles: 4 }, { ...style, alpha: 0 }, project, { width: 800, height: 600 })).toBe(false);
    expect(drawNameAlongPath(ctx, { text: "A", points: [{ x: 900, y: 0 }, { x: 902, y: 0 }], heightTiles: 1, spanTiles: 4 }, style, project, { width: 800, height: 600 })).toBe(false);
    expect(glyphs).toHaveLength(0);
  });
});

describe("island labels", () => {
  it("lay along the island's long axis", () => {
    const path = islandLabelPath({ id: "0,0", x: 10, y: 5, angle: 0, span: 20, thickness: 6, name: "Gloamspire", status: "default" });
    expect(path.points[0]!.y).toBeCloseTo(5);
    expect(path.points[1]!.x - path.points[0]!.x).toBeCloseTo(16.8);
  });

  it("keep a continent's name compact instead of spreading it across the world", () => {
    const path = islandLabelPath({ id: "0,0", x: 14, y: 305, angle: 0.3, span: 678, thickness: 388, name: "The Khazhold Expanse", status: "default" });
    const length = Math.hypot(path.points[1]!.x - path.points[0]!.x, path.points[1]!.y - path.points[0]!.y);
    expect(length).toBeCloseTo(36);
  });
});
