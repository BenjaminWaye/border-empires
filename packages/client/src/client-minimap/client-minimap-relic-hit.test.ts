import { describe, expect, it } from "vitest";
import type { RelicMapHint } from "@border-empires/shared";
import { miniMapRelicHintAt, miniMapRelicMarkerPoint } from "./client-minimap-relic-hit.js";

// A 100x100-tile view of the world drawn on a 200x200 minimap.
const box = { x0: 400, y0: 40, w: 100, h: 100 };
const wake: RelicMapHint = { x: 440, y: 165, kind: "WAKE", ownerId: "rival" };

describe("miniMapRelicHintAt", () => {
  it("finds a relic pinned to the edge, where the press would otherwise pan to the edge", () => {
    const point = miniMapRelicMarkerPoint(wake, box, 200, 200);
    expect(point.y).toBeCloseTo(192); // bottom edge, 8px inset
    expect(miniMapRelicHintAt([wake], box, 200, 200, point.x + 3, point.y - 2)).toBe(wake);
  });

  it("finds a relic inside the view at its tile", () => {
    const inside: RelicMapHint = { x: 450, y: 60, kind: "RELIC" };
    expect(miniMapRelicMarkerPoint(inside, box, 200, 200)).toEqual({ x: 101, y: 41 });
    expect(miniMapRelicHintAt([inside], box, 200, 200, 101, 41)).toBe(inside);
  });

  it("misses presses away from the box and ignores survey signatures", () => {
    expect(miniMapRelicHintAt([wake], box, 200, 200, 20, 20)).toBeUndefined();
    const survey: RelicMapHint = { x: 450, y: 60, kind: "RESOURCE", resource: "TITANIUM" };
    expect(miniMapRelicHintAt([survey], box, 200, 200, 101, 41)).toBeUndefined();
  });
});
