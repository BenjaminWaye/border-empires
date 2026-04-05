import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("converter toggle regression guard", () => {
  it("wires enable and disable converter actions through the tile menu and action flow", () => {
    const logic = clientSource("./client-tile-action-logic.ts");
    const flow = clientSource("./client-action-flow.ts");
    expect(logic).toContain('id: "disable_converter_structure" as TileActionDef["id"]');
    expect(logic).toContain('id: "enable_converter_structure" as TileActionDef["id"]');
    expect(flow).toContain('type: "SET_CONVERTER_STRUCTURE_ENABLED"');
  });

  it("preloads and renders the base crystal synthesizer overlay", () => {
    const render = clientSource("./client-map-render.ts");
    const loop = clientSource("./client-runtime-loop.ts");
    expect(render).toContain('CRYSTAL_SYNTHESIZER: loadOverlayImage("crystal-synthesizer-overlay.svg")');
    expect(loop).toContain('} else if (t.economicStructure.type === "CRYSTAL_SYNTHESIZER") {');
    expect(loop).toContain("deps.structureOverlayImages.CRYSTAL_SYNTHESIZER");
  });
});
