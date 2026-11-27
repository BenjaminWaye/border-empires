import { CREST_COSMETIC_IDS } from "@border-empires/shared";
import { DataTexture } from "three";
import { describe, expect, it } from "vitest";

import { bannerCrestIndex, createBannerCrestAtlas, CREST_ATLAS_COLUMNS, CREST_ATLAS_ROWS, crestAtlasCell, fillCrestAtlasCells } from "./muster-banner-crest-atlas.js";
import { createMusterBannerClothMaterials } from "./muster-banner-cloth-material.js";

describe("banner crest atlas", () => {
  it("gives every crest its own cell and keeps 0 for no crest", () => {
    expect(bannerCrestIndex(undefined)).toBe(0);
    const cells = new Set<string>();
    for (const id of CREST_COSMETIC_IDS) {
      const { column, row } = crestAtlasCell(bannerCrestIndex(id));
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(CREST_ATLAS_COLUMNS);
      expect(row).toBeLessThan(CREST_ATLAS_ROWS);
      cells.add(`${column},${row}`);
    }
    expect(cells.size).toBe(CREST_COSMETIC_IDS.length);
  });

  it("falls back to an empty atlas without a DOM, so a flag keeps its device", () => {
    expect(createBannerCrestAtlas().texture).toBeInstanceOf(DataTexture);
  });

  it("samples the atlas in the cloth shader in place of the device", () => {
    const { cloth } = createMusterBannerClothMaterials();
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>" };
    cloth.onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms.uBannerCrests?.value).toBeDefined();
    expect(shader.vertexShader).toContain("vBannerCrest = aBannerCrest;");
    expect(shader.fragmentShader).toContain("bannerCrest(deviceP, vBannerCrest)");
    expect(shader.fragmentShader).toContain("device = mix(device, crestTexel.x, hasCrest);");
  });

  // Review finding (PR #3022): the device was hidden as soon as a crest index
  // was set, so a flag showed a blank patch until the atlas loaded, and for
  // good if an image failed. A crest now shows only once its cell has loaded.
  it("keeps the device until the crest's atlas cell has loaded", () => {
    const { cloth } = createMusterBannerClothMaterials();
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>" };
    cloth.onBeforeCompile(shader as never, undefined as never);
    expect(shader.fragmentShader).toContain("float hasCrest = step(0.5, vBannerCrest) * step(0.5, crestTexel.z);");
    expect(shader.fragmentShader).toContain("float loaded = texture2D(uBannerCrests, centre).b;");
  });

  it("paints a cell only for a crest whose image loaded, each as soon as it arrives", async () => {
    const failing = CREST_COSMETIC_IDS[3]!;
    const painted: string[] = [];
    await fillCrestAtlasCells(
      async (id) => (id === failing ? undefined : id),
      (image, cell) => painted.push(`${image}@${cell.column},${cell.row}`)
    );
    expect(painted).toHaveLength(CREST_COSMETIC_IDS.length - 1);
    expect(painted.some((entry) => entry.startsWith(`${failing}@`))).toBe(false);
    const first = crestAtlasCell(1);
    expect(painted).toContain(`${CREST_COSMETIC_IDS[0]}@${first.column},${first.row}`);
  });

  it("leaves the cell unpainted when a load throws", async () => {
    const painted: string[] = [];
    await fillCrestAtlasCells(async () => { throw new Error("decode failed"); }, () => painted.push("x"));
    expect(painted).toEqual([]);
  });
});
