import { Group, Mesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createBattleStrikeFxLayer, STRIKE_LEAD_MS, STRIKE_TOTAL_MS } from "./popup-marine-strike-fx.js";

const opacityOf = (mesh: Mesh): number => (mesh.material as { opacity: number }).opacity;

describe("battle strike fx", () => {
  it("adds one entry group on spawn and removes it once its lifetime ends", () => {
    const scene = new Scene();
    const fx = createBattleStrikeFxLayer(scene);
    expect(fx.group.children.length).toBe(0);

    fx.spawn(1, 2, 0, 0);
    expect(fx.group.children.length).toBe(1);

    fx.update(0);
    expect(fx.group.children.length).toBe(1);

    fx.update(STRIKE_TOTAL_MS + 1);
    expect(fx.group.children.length).toBe(0);
    fx.dispose();
  });

  it("beam is invisible before the impact and the impact flash fires exactly once at STRIKE_LEAD_MS", () => {
    const scene = new Scene();
    const fx = createBattleStrikeFxLayer(scene);
    fx.spawn(0, 0, 0, 0);
    const entry = fx.group.children[0] as Group;
    const [beam, beamCore, ring, flash] = entry.children as Mesh[];

    // Mid-descent, well before impact: beam core visible, flash/ring not.
    fx.update(STRIKE_LEAD_MS * 0.5);
    expect(opacityOf(beamCore!)).toBeGreaterThan(0);
    expect(opacityOf(flash!)).toBe(0);
    expect(opacityOf(ring!)).toBe(0);

    // Instant of impact: the flash pops on.
    fx.update(STRIKE_LEAD_MS);
    expect(opacityOf(flash!)).toBeGreaterThan(0);

    // Long after impact, before full expiry: beam has faded out, flash tail gone.
    fx.update(STRIKE_TOTAL_MS - 1);
    expect(opacityOf(beam!)).toBe(0);
    fx.dispose();
  });

  it("clear() removes every in-flight strike", () => {
    const scene = new Scene();
    const fx = createBattleStrikeFxLayer(scene);
    fx.spawn(0, 0, 0, 0);
    fx.spawn(1, 1, 0, 0);
    expect(fx.group.children.length).toBe(2);
    fx.clear();
    expect(fx.group.children.length).toBe(0);
    fx.dispose();
  });

  it("dispose() removes the whole layer from the scene", () => {
    const scene = new Scene();
    const fx = createBattleStrikeFxLayer(scene);
    fx.spawn(0, 0, 0, 0);
    fx.dispose();
    expect(scene.children.includes(fx.group)).toBe(false);
  });
});
