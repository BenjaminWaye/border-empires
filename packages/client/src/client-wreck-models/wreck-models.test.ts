import { describe, expect, it } from "vitest";
import { WAR_SCAR_MAX_LEVEL } from "@border-empires/shared";
import { createWreckGeometry, wreckModelVariants, type WreckModel } from "./wreck-models.js";

const vertexCount = (model: WreckModel, variant = 0): number => {
  const geometry = createWreckGeometry(model, variant).geometry;
  return Object.values(geometry.layers).reduce((sum, layer) => sum + (layer?.getAttribute("position").count ?? 0), 0);
};

const layersOf = (model: WreckModel): string[] =>
  Object.keys(createWreckGeometry(model, 0).geometry.layers).sort();

describe("wreck models", () => {
  it("build every wreck from metal, glass and stone, with ember glow and smoke", () => {
    for (const model of [{ kind: "RELAY_BEACON" }, { kind: "SIEGE", variant: "SIEGE_BATTERY" }, { kind: "SIEGE", variant: "DREAD_TOWER" }] as const) {
      expect(layersOf(model)).toEqual(expect.arrayContaining(["body", "metal", "glass", "glow", "halo", "steam"]));
    }
    expect(layersOf({ kind: "RESOURCE_FIRE" })).toEqual(expect.arrayContaining(["glow", "steam"]));
    expect(layersOf({ kind: "FORT_BREACH" })).toEqual(expect.arrayContaining(["body", "glow", "steam"]));
  });

  it("scorch the ground under every wreck", () => {
    for (const model of [{ kind: "RELAY_BEACON" }, { kind: "SIEGE", variant: "SIEGE_TOWER" }, { kind: "FORT_BREACH" }, { kind: "RESOURCE_FIRE" }, { kind: "BATTLE_SCARS", level: 1 }] as const) {
      expect(createWreckGeometry(model, 0).marks.length).toBeGreaterThan(0);
    }
  });

  it("keep the Relay Beacon's own foundation plate under its wreck", () => {
    expect(layersOf({ kind: "RELAY_BEACON" })).toContain("plinth");
  });

  it("grow with every level of battle scars", () => {
    const sizes = Array.from({ length: WAR_SCAR_MAX_LEVEL }, (_, i) => vertexCount({ kind: "BATTLE_SCARS", level: i + 1 }));
    for (let i = 1; i < sizes.length; i += 1) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]!);
    expect(layersOf({ kind: "BATTLE_SCARS", level: 1 })).not.toContain("steam");
    expect(layersOf({ kind: "BATTLE_SCARS", level: WAR_SCAR_MAX_LEVEL })).toEqual(expect.arrayContaining(["glow", "steam"]));
  });

  it("vary between variants", () => {
    const model = { kind: "BATTLE_SCARS", level: 3 } as const;
    expect(wreckModelVariants(model)).toBeGreaterThan(1);
    const a = createWreckGeometry(model, 0).geometry.layers.body!.getAttribute("position").array;
    const b = createWreckGeometry(model, 1).geometry.layers.body!.getAttribute("position").array;
    expect(Array.from(a.slice(0, 30))).not.toEqual(Array.from(b.slice(0, 30)));
  });
});
