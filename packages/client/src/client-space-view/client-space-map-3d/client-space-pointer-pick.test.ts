import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { resolvePickedSeasonId } from "./client-space-pointer-pick.js";

const intersectionOf = (object: Object3D) => ({ object }) as any;

describe("resolvePickedSeasonId", () => {
  it("returns null with no intersections", () => {
    expect(resolvePickedSeasonId([])).toBeNull();
  });

  it("reads seasonId directly off the hit object", () => {
    const mesh = new Object3D();
    mesh.userData.seasonId = "season-9";
    expect(resolvePickedSeasonId([intersectionOf(mesh)])).toBe("season-9");
  });

  it("walks up to an ancestor group carrying seasonId (e.g. a glow shell hit)", () => {
    const group = new Object3D();
    group.userData.seasonId = "season-parent";
    const child = new Object3D();
    group.add(child);
    expect(resolvePickedSeasonId([intersectionOf(child)])).toBe("season-parent");
  });

  it("skips non-planet hits and returns the first resolvable one", () => {
    const plain = new Object3D();
    const planet = new Object3D();
    planet.userData.seasonId = "season-found";
    expect(resolvePickedSeasonId([intersectionOf(plain), intersectionOf(planet)])).toBe("season-found");
  });
});
