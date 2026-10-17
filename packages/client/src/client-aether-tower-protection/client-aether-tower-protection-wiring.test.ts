import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Both map renderers need a real canvas/WebGL to construct, so verify the
// protection-field wiring by reading the source, as
// client-map-3d-observatory-range-regression.test.ts does. AGENTS.md:
// map-tile overlays must exist on the true-3D AND the 2D fallback renderer.
const source = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Aether Tower protection field renderer wiring", () => {
  it("builds the wash on the true-3D renderer's per-tile rebuild pass", () => {
    const map3d = source("../client-map-3d/client-map-3d.ts");
    const begin = map3d.indexOf("aetherProtectionOverlay.begin(deps.state, deps.keyFor)");
    const add = map3d.indexOf("aetherProtectionOverlay.addTile(tile, x, z, flatOverlayY)");
    const commit = map3d.indexOf("aetherProtectionOverlay.commit()");
    expect(begin).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(begin);
    expect(commit).toBeGreaterThan(add);
    expect(map3d).toContain("aetherProtectionOverlay.dispose()");
    // Toggling it on/off must force a rebuild, or a still camera never shows it.
    expect(source("../client-map-3d-rebuild-triggers/client-map-3d-rebuild-triggers.ts")).toContain(
      "aetherProtectionKey: aetherProtectionRebuildKey(state, keyFor)"
    );
  });

  it("paints the same tiles on the 2D fallback renderer", () => {
    const loop = source("../client-runtime-loop.ts");
    expect(loop).toContain(
      "const aetherProtection2D = !isTrue3DRendererActive() && isAetherProtectionFieldShown(state, deps.keyFor) ? aetherProtectionField(state, Date.now()) : undefined;"
    );
    expect(loop).toContain(
      'if (!isTrue3DRendererActive() && vis === "visible") drawAetherProtectionTile2D(deps.ctx, t, aetherProtection2D, (x, y) => state.tiles.get(deps.keyFor(x, y)), px, py, size);'
    );
  });
});
