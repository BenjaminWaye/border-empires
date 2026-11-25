import { describe, expect, it } from "vitest";
import { createRelicState, type RelicMapHint } from "@border-empires/shared";
import { edgeTabPoint, relicSitePlateFor, tilesFromCamera } from "./relic-site-plate-model.js";

const wake: RelicMapHint = { x: 440, y: 165, kind: "WAKE", ownerId: "rival" };
const names = (id: string): string | undefined => (id === "rival" ? "Velvet Crown" : undefined);

describe("relicSitePlateFor", () => {
  it("names a rival's running relic and the House running it", () => {
    expect(relicSitePlateFor(wake, undefined, "me", names)).toMatchObject({ key: "440,165", kind: "WAKE", title: "Concordance relic", detail: "Velvet Crown · running", ownerId: "rival" });
    expect(relicSitePlateFor({ ...wake, ownerId: "ghost" }, undefined, "me", names)?.detail).toBe("A rival House · running");
  });

  it("labels a transponder in range, and drops it once the relic itself is on the map", () => {
    const signal: RelicMapHint = { x: 4, y: 7, kind: "RELIC" };
    expect(relicSitePlateFor(signal, undefined, "me", names)).toMatchObject({ title: "Relic signal", detail: "In signal range" });
    expect(relicSitePlateFor(signal, { naturalWonder: createRelicState("QUICKFORGE") }, "me", names)).toBeUndefined();
  });

  it("has no plate for your own relic or a survey signature", () => {
    expect(relicSitePlateFor({ ...wake, ownerId: "me" }, undefined, "me", names)).toBeUndefined();
    expect(relicSitePlateFor({ x: 1, y: 1, kind: "RESOURCE", resource: "TITANIUM" }, undefined, "me", names)).toBeUndefined();
  });
});

describe("edge tab", () => {
  const insets = { top: 96, right: 12, bottom: 150, left: 12 };
  it("pins a site below the screen to the bottom inset, pointing down", () => {
    const tab = edgeTabPoint(400, 5000, 800, 840, insets)!;
    expect(tab.y).toBeCloseTo(690);
    expect(tab.x).toBeCloseTo(400, 0);
    expect(tab.angle).toBeCloseTo(Math.PI / 2);
  });
  it("leaves an on-screen point alone", () => {
    expect(edgeTabPoint(400, 400, 800, 840, insets)).toBeUndefined();
  });
  it("counts tiles across the world's wrap", () => {
    expect(tilesFromCamera(5, 10, 635, 10)).toBe(10);
  });
});
