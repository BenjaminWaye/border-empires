import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the "one-shot 3D effects stay on their tile while the camera pans"
// rule (client-map-3d-anchored-fx-root.ts). The render loop needs a full WebGL
// renderer, so like client-map-3d-camera-ordering-regression.test.ts this
// checks the wiring by reading the source.
const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");

/** Every `export const createXxxFxLayer` / `createFloatingTextLayer` defined anywhere in the client source. */
const listFxLayerFactories = (): string[] => {
  const srcRoot = new URL("..", import.meta.url).pathname;
  const names = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) {
        for (const match of readFileSync(path, "utf8").matchAll(/export const (create\w*(?:FxLayer|FloatingTextLayer))\b/g)) names.add(match[1]!);
      }
    }
  };
  walk(srcRoot);
  return [...names].sort();
};

describe("anchored 3D effect wiring", () => {
  const mapSource = read("../client-map-3d/client-map-3d.ts");
  const castSource = read("../client-map-3d/client-map-3d-fx-cast-overlays.ts");
  const layersSource = read("./client-map-3d-anchored-fx-layers.ts");

  it("creates every one-shot effect layer under the anchored root, never against the raw scene in client-map-3d.ts", () => {
    // Layers allowed outside the anchored root, each with the reason it cannot drift. Adding to this list
    // needs the same kind of reason; "it is short" is not one on its own.
    const notAnchored: Record<string, string> = {
      createBorderDustFxLayer: "re-seeded from tile coordinates on every terrain rebuild (setSeams)",
      createConstructionPodFxLayer: "construction presentation re-anchors in-flight pods on every rebuild (pods.relocate)",
      createBattleStrikeFxLayer: "owned by the popup-marine overlay, which positions its battle in the current scene each frame; one strike lasts ~1 s"
    };
    const factories = listFxLayerFactories().filter((name) => !(name in notAnchored));
    expect(factories.length).toBeGreaterThan(10);
    for (const name of factories) {
      expect(mapSource, `${name} must be created in client-map-3d-anchored-fx-layers.ts, not client-map-3d.ts`).not.toMatch(new RegExp(`\\b${name}\\(`));
      expect(layersSource, `${name} is a one-shot effect layer: create it in createAnchoredFxLayers`).toMatch(new RegExp(`\\b${name}\\(root\\.group|\\b${name}\\(floatingTextGroup`));
    }
  });

  it("spawns every queued effect at anchored-local coordinates, never at plain scene-origin coordinates", () => {
    const syncBodies = castSource.split(/\n  const (?=sync\w+ = )/).slice(1);
    const spawning = syncBodies.filter((body) => /\.spawn\(/.test(body));
    expect(spawning.length).toBeGreaterThan(10);
    for (const body of spawning) {
      const name = body.slice(0, body.indexOf(" "));
      expect(body, `${name} must place its effect with fxXZ / anchoredFx.toLocal`).not.toMatch(/originSceneXZ\(/);
      expect(body, `${name} must place its effect with fxXZ / anchoredFx.toLocal`).toMatch(/fxXZ\(|anchoredFx\.toLocal\(/);
    }
  });

  it("follows the scene origin every frame before effects spawn and update", () => {
    const followAt = mapSource.indexOf("anchoredFx.root.follow(sceneOrigin)");
    expect(followAt).toBeGreaterThan(-1);
    expect(followAt).toBeLessThan(mapSource.indexOf("syncAfcDropFxQueue();"));
    expect(followAt).toBeLessThan(mapSource.indexOf("afcDropFx.update(nowMs)"));
    expect(followAt).toBeGreaterThan(mapSource.indexOf("const renderLoop"));
  });
});
