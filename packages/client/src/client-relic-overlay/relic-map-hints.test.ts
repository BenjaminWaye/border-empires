import { describe, expect, it } from "vitest";
import { createRelicState, type RelicMapHint } from "@border-empires/shared";
import { shouldDrawRelicHint } from "./relic-map-hints.js";

const beam: RelicMapHint = { x: 4, y: 7, kind: "RELIC" };
const wake: RelicMapHint = { x: 4, y: 7, kind: "WAKE", ownerId: "p2" };
const survey: RelicMapHint = { x: 4, y: 7, kind: "RESOURCE", resource: "TITANIUM" };

describe("shouldDrawRelicHint", () => {
  it("shows the transponder beam while the relic itself is not on the map", () => {
    expect(shouldDrawRelicHint(beam, undefined)).toBe(true);
    expect(shouldDrawRelicHint(beam, {})).toBe(true);
  });

  it("hides the beam once the tile carries the relic model", () => {
    expect(shouldDrawRelicHint(beam, { naturalWonder: createRelicState("QUICKFORGE") })).toBe(false);
  });

  it("always draws a rival's aether wake, even over a known relic model", () => {
    expect(shouldDrawRelicHint(wake, undefined)).toBe(true);
    expect(shouldDrawRelicHint(wake, { naturalWonder: createRelicState("QUICKFORGE") })).toBe(true);
  });

  it("keeps survey signatures except on a depleted relic", () => {
    const relic = createRelicState("QUICKFORGE");
    expect(shouldDrawRelicHint(survey, { naturalWonder: relic })).toBe(true);
    expect(shouldDrawRelicHint(survey, { naturalWonder: { ...relic, remainingUses: 0 } })).toBe(false);
    expect(shouldDrawRelicHint(undefined, undefined)).toBe(false);
  });
});
