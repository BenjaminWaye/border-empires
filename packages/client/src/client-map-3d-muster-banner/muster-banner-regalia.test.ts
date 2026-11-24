import { Color, InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";

import { createMusterBannerRegalia } from "./muster-banner-regalia.js";
import { REGALIA_GLOWS, REGALIA_MOTE_RADIUS, REGALIA_MOTES } from "./muster-banner-regalia-fx.js";
import { MUSTER_PLINTH_RADIUS } from "./muster-banner-geometry.js";
import { REGALIA_SPARKLE_POINTS } from "./muster-banner-regalia-geometry.js";

const mesh = (scene: Scene, part: string): InstancedMesh => {
  const found = scene.getObjectByName(`muster-banner-regalia-${part}`);
  if (!(found instanceof InstancedMesh)) throw new Error(`missing ${part}`);
  return found;
};
const PARTS = ["gold", "enamel", "streamers", "aureole", "halo", "sparkles", "glow", "motes"];
const flag = (x: number, tint: string) => ({ x, y: 0.2, z: 3, tint: new Color(tint), seed: 0.4 });

describe("High-noble standard regalia on the map", () => {
  it("draws nothing, and does no per-frame work, when no flag carries it", () => {
    const scene = new Scene();
    const regalia = createMusterBannerRegalia(scene, 8);
    regalia.commit([]);
    regalia.tick(1_000);
    for (const part of PARTS) expect(mesh(scene, part).count).toBe(0);
    expect(mesh(scene, "aureole").instanceMatrix.version).toBe(0);
    regalia.dispose();
  });

  it("draws every part once per flag, with glow, dust and sparkles sized per flag", () => {
    const scene = new Scene();
    const regalia = createMusterBannerRegalia(scene, 8);
    regalia.commit([flag(1, "#ff0000"), flag(5, "#00ff00")]);
    for (const part of ["gold", "enamel", "streamers", "aureole", "halo"]) expect(mesh(scene, part).count).toBe(2);
    expect(mesh(scene, "sparkles").count).toBe(2 * REGALIA_SPARKLE_POINTS.length);
    expect(mesh(scene, "glow").count).toBe(2 * REGALIA_GLOWS);
    expect(mesh(scene, "motes").count).toBe(2 * REGALIA_MOTES);
    regalia.dispose();
  });

  it("colours gems, streamers and gem glows in the owner's colour", () => {
    const scene = new Scene();
    const regalia = createMusterBannerRegalia(scene, 8);
    regalia.commit([flag(1, "#ff0000")]);
    const tint = new Color();
    for (const part of ["enamel", "streamers"]) {
      mesh(scene, part).getColorAt(0, tint);
      expect(tint.getHexString()).toBe("ff0000");
    }
    const glowColor = mesh(scene, "glow").geometry.getAttribute("aGlowColor");
    // Glow 0 is the gold one behind the aureole; glow 1 is the boss gem's, in the owner's red.
    expect(glowColor.getY(0)).toBeGreaterThan(0.2);
    expect(glowColor.getX(1)).toBeGreaterThan(0.5);
    expect(glowColor.getY(1)).toBe(0);
    regalia.dispose();
  });

  it("turns the aureole and the halo in opposite directions", () => {
    const scene = new Scene();
    const regalia = createMusterBannerRegalia(scene, 8);
    regalia.commit([{ ...flag(0, "#ff0000"), seed: 0 }]);
    regalia.tick(4_000);
    // Rotation about z: the matrix's second element is sin(angle).
    const sinOf = (part: string): number => mesh(scene, part).instanceMatrix.array[1] as number;
    expect(sinOf("aureole")).toBeGreaterThan(0);
    expect(sinOf("halo")).toBeLessThan(0);
    regalia.dispose();
  });

  it("never draws more flags than it was sized for, and keeps the dust inside the plinth", () => {
    const scene = new Scene();
    const regalia = createMusterBannerRegalia(scene, 2);
    regalia.commit([flag(1, "#ff0000"), flag(2, "#ff0000"), flag(3, "#ff0000")]);
    expect(mesh(scene, "gold").count).toBe(2);
    expect(mesh(scene, "motes").count).toBe(2 * REGALIA_MOTES);
    expect(REGALIA_MOTE_RADIUS).toBeLessThan(MUSTER_PLINTH_RADIUS);
    regalia.dispose();
  });
});
