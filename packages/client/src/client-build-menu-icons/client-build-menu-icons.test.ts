import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TileActionDef } from "../client-types.js";
import { BUILDING_CATEGORY_ORDER } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import { BUILD_MENU_ART_CROP } from "./client-build-menu-art-crop.js";
import { buildActionArtUrl, buildActionIconHtml, buildingCategoryIconHtml } from "./client-build-menu-icons.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicFile = (url: string): string => resolve(here, "../../public", url.slice(1));

// Every build/upgrade action id declared on TileActionDef.
const buildActionIds = (): TileActionDef["id"][] => {
  const source = readFileSync(resolve(here, "../client-tile-action-def-types.ts"), "utf8");
  return [...new Set([...source.matchAll(/"((?:build|upgrade)_[a-z0-9_]+)"/g)].map((match) => match[1] as TileActionDef["id"]))];
};

describe("build menu category icons", () => {
  it("ships a PNG at every size for every category", () => {
    for (const category of BUILDING_CATEGORY_ORDER) {
      const srcs = [...buildingCategoryIconHtml(category).matchAll(/\/icons\/build-categories\/[a-z_]+-\d+\.png/g)].map((m) => m[0]);
      expect(srcs.length, category).toBeGreaterThan(0);
      for (const src of srcs) expect(existsSync(publicFile(src)), src).toBe(true);
    }
  });
});

describe("build menu building art", () => {
  it("only points at overlay files that exist", () => {
    const source = readFileSync(resolve(here, "../client-structure-art/client-structure-art.ts"), "utf8");
    const urls = [...source.matchAll(/"(\/overlays\/[^"]+)"/g)].map((match) => match[1]!);
    expect(urls.length).toBeGreaterThan(40);
    for (const url of urls) expect(existsSync(publicFile(url)), url).toBe(true);
  });

  it("has a measured crop box for every overlay it can show", () => {
    const source = readFileSync(resolve(here, "../client-structure-art/client-structure-art.ts"), "utf8");
    const urls = [...new Set([...source.matchAll(/"(\/overlays\/[^"]+)"/g)].map((match) => match[1]!))];
    expect(urls.filter((url) => !BUILD_MENU_ART_CROP[url])).toEqual([]);
  });

  it("scales the crop box to fill the slot and centres it", () => {
    // mintworks art box [0.098, 0.117, 0.699, 0.695]: scale 1/0.699 = 143.06%,
    // left -0.098*1.4306 + (1-1)/2 = -14.02%, top -0.117*1.4306 + (1-0.9943)/2 = -16.45%
    const html = buildActionIconHtml("build_mintworks") ?? "";
    expect(html).toContain('style="width:143.06%;height:143.06%;left:-14.02%;top:-16.45%"');
  });

  it("shows the building's own map art for buildings that have it", () => {
    expect(buildActionArtUrl("build_mintworks")).toBe("/overlays/mintworks-overlay.svg");
    expect(buildActionArtUrl("build_fortification")).toBe("/overlays/fort-ring-overlay-closed.svg");
    expect(buildActionIconHtml("build_hydrogarden")).toContain('src="/overlays/farm-hydrogarden-overlay-1.svg"');
    expect(buildActionArtUrl("upgrade_titanium_works")).toBe("/overlays/high-yield-titanium-works-overlay.svg");
  });

  it("returns nothing for actions that build nothing, so the glyph stays", () => {
    expect(buildActionIconHtml("launch_attack")).toBeUndefined();
  });

  it("keeps the list of buildings still waiting for art explicit", () => {
    const missing = buildActionIds().filter((id) => !buildActionArtUrl(id)).sort();
    expect(missing).toMatchInlineSnapshot(`
      [
        "build_aegis_dome_part_1",
        "build_aegis_dome_part_2",
        "build_aegis_dome_part_3",
        "build_afc",
        "build_bank",
        "build_exchange_house",
        "build_fuel_plant",
        "build_lockworks_port",
        "build_quartermasters_office",
        "build_titanium_levy_part_1",
        "build_titanium_levy_part_2",
        "build_titanium_levy_part_3",
        "build_hydroworks",
        "build_weapons_workshop",
      ]
    `);
  });
});
