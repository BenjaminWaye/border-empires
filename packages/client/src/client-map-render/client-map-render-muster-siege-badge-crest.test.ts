// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("../client-house-crest/client-crest-image.js", () => ({
  crestImage: vi.fn((id: string) => ({ id }) as unknown as HTMLImageElement)
}));

import { crestImage } from "../client-house-crest/client-crest-image.js";
import { CREST_MIN_TILE_PX, drawMusterSiegeBadge } from "./client-map-render-muster-siege-badge.js";

const fakeCtx = () => {
  const drawn: unknown[] = [];
  const arcs: number[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => {
      if (key === "drawImage") return (image: unknown) => drawn.push(image);
      if (key === "arc") return (x: number) => arcs.push(x);
      if (key in target) return target[key as string];
      return () => undefined;
    },
    set: (target, key, value) => { target[key as string] = value; return true; }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, drawn, arcs };
};

describe("2D muster siege pennant with a House crest", () => {
  it("draws the owner's crest on the pennant once the tile is large enough to read it", () => {
    const { ctx, drawn } = fakeCtx();
    drawMusterSiegeBadge(ctx, 0, 0, CREST_MIN_TILE_PX, "#ff0000", 0, "default", "crest-anchor");
    expect(drawn).toEqual([{ id: "crest-anchor" }]);
  });

  it("leaves a small pennant plain, and draws nothing extra without a crest", () => {
    const small = fakeCtx();
    drawMusterSiegeBadge(small.ctx, 0, 0, CREST_MIN_TILE_PX - 1, "#ff0000", 0, "default", "crest-anchor");
    expect(small.drawn).toEqual([]);
    const none = fakeCtx();
    drawMusterSiegeBadge(none.ctx, 0, 0, 64, "#ff0000", 0);
    expect(none.drawn).toEqual([]);
  });

  it("puts the crest in place of the High-noble sun, keeping the finial", () => {
    const sun = fakeCtx();
    drawMusterSiegeBadge(sun.ctx, 0, 0, 64, "#ff0000", 0, "flag-high-noble");
    const crested = fakeCtx();
    drawMusterSiegeBadge(crested.ctx, 0, 0, 64, "#ff0000", 0, "flag-high-noble", "crest-key");
    expect(crested.drawn).toHaveLength(1);
    expect(crested.arcs.length).toBe(sun.arcs.length - 1);
  });

  it("falls back to the plain pennant until the crest image has loaded", () => {
    vi.mocked(crestImage).mockReturnValueOnce(undefined);
    const { ctx, drawn, arcs } = fakeCtx();
    drawMusterSiegeBadge(ctx, 0, 0, 64, "#ff0000", 0, "flag-high-noble", "crest-key");
    expect(drawn).toEqual([]);
    const sun = fakeCtx();
    drawMusterSiegeBadge(sun.ctx, 0, 0, 64, "#ff0000", 0, "flag-high-noble");
    expect(arcs.length).toBe(sun.arcs.length);
  });
});
