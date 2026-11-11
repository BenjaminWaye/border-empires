import { describe, expect, it } from "vitest";
import { buildPlaceHtml } from "./client-hud-v2-build-list.js";
import { buildSlotsHtml, createSlotPulse } from "./client-hud-v2-tracker.js";
import type { TileActionDef } from "../client-types.js";

const buildings = [{ id: "build_fort", label: "Fort" } as unknown as TileActionDef];

// Regression: Place gave no visible sign the press went through (the map isn't visible on a phone).
describe("Place confirmation", () => {
  it("turns the Place button into a confirmation right after a press", () => {
    const base = { buildings, selection: "build_fort", targetKey: "1,1", placeLabel: "Place" };
    expect(buildPlaceHtml(base)).toContain(">Place</button>");
    expect(buildPlaceHtml({ ...base, placed: "started" })).toContain(">✓ Placed</button>");
    expect(buildPlaceHtml({ ...base, placed: "queued" })).toContain("v2t-place-done");
    expect(buildPlaceHtml({ ...base, placed: "queued" })).toContain(">✓ Queued</button>");
  });

  it("highlights Dev slots for a moment when a build takes a slot or joins the queue, not when one frees", () => {
    const pulse = createSlotPulse();
    expect(pulse(1, 0, 0)).toBe(false);
    expect(pulse(2, 0, 100)).toBe(true);
    expect(pulse(2, 0, 1_000)).toBe(true);
    expect(pulse(2, 0, 2_200)).toBe(false);
    expect(pulse(2, 1, 3_000)).toBe(true);
    expect(pulse(1, 0, 6_000)).toBe(false);
    expect(buildSlotsHtml({ busy: 2, limit: 3 }, false, true)).toContain("hud-v2-slots-pulse");
  });
});
