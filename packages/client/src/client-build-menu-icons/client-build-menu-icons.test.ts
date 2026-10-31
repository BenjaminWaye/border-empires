import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TileActionDef } from "../client-types.js";
import { BUILDING_CATEGORY_ORDER } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import { BUILD_MENU_ART_CROP } from "./client-build-menu-art-crop.js";
import { buildActionArtUrl, buildActionIconHtml, buildingCategoryIconHtml, structureArtIconHtml } from "./client-build-menu-icons.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicFile = (url: string): string => resolve(here, "../../public", url.slice(1).split("?")[0]!);

// Every build/upgrade action id declared on TileActionDef.
const buildActionIds = (): TileActionDef["id"][] => {
  const source = readFileSync(resolve(here, "../client-tile-action-def-types.ts"), "utf8");
  return [...new Set([...source.matchAll(/"((?:build|upgrade)_[a-z0-9_]+)"/g)].map((match) => match[1] as TileActionDef["id"]))];
};

describe("build menu category icons", () => {
  it("ships the simple SVG for every category", () => {
    for (const category of BUILDING_CATEGORY_ORDER) {
      const srcs = [...buildingCategoryIconHtml(category).matchAll(/\/icons\/simple\/[a-z-]+\.svg/g)].map((m) => m[0]);
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

  it("ships the art and measured crop for every mapped build action, including district icons", () => {
    for (const id of buildActionIds()) {
      const url = buildActionArtUrl(id);
      if (!url) continue;
      expect(existsSync(publicFile(url)), `${id}: ${url}`).toBe(true);
      expect(BUILD_MENU_ART_CROP[url], `${id}: crop`).toBeDefined();
    }
  });

  it("scales the crop box to fill the slot and centres it", () => {
    // The unchanged Fort crop is a fixed input for the thumbnail math.
    const html = buildActionIconHtml("build_fortification") ?? "";
    expect(html).toContain('style="width:103.2%;height:103.2%;left:-1.65%;top:-3.2%"');
  });

  it("shows the building's own map art for buildings that have it", () => {
    expect(buildActionArtUrl("build_manufactory")).toContain("/overlays/town-district/manufactory.svg?");
    expect(buildActionArtUrl("build_fortification")).toBe("/overlays/fort-ring-overlay-closed.svg");
    expect(buildActionArtUrl("upgrade_titanium_works")).toContain("/overlays/town-district/high-yield-titanium-works.svg?");
  });

  it("matches the 2D map's art for Hydrogarden and Hydroworks after the Farmstead rename", () => {
    // Resource Hydrogardens retain their dome; utility Hydroworks use the district kit.
    expect(buildActionIconHtml("build_hydrogarden")).toContain('src="/overlays/farm-hydroponic-overlay-1.svg"');
    expect(buildActionIconHtml("build_hydroworks")).toContain('src="/overlays/town-district/hydroworks.svg?');
  });

  it("gives structure-type callers the same cropped thumbnail", () => {
    expect(structureArtIconHtml("MANUFACTORY", "manifest-gain__art")).toBe(buildActionIconHtml("build_manufactory")?.replace("tile-action-art", "manifest-gain__art"));
    expect(structureArtIconHtml("THUNDER_BASTION", "x")).toContain('src="/overlays/fort-ring-overlay-closed.svg"');
    expect(structureArtIconHtml("DREAD_TOWER", "x")).toContain('src="/overlays/siege-battery-overlay.svg"');
    expect(structureArtIconHtml("NOT_A_STRUCTURE", "x")).toBeUndefined();
  });

  it("returns nothing for actions that build nothing, so the glyph stays", () => {
    expect(buildActionIconHtml("launch_attack")).toBeUndefined();
  });

  it("keeps unmapped legacy or unsupported build actions explicit", () => {
    const missing = buildActionIds().filter((id) => !buildActionArtUrl(id)).sort();
    expect(missing).toMatchInlineSnapshot(`
      [
        "build_afc",
        "build_bank",
        "build_exchange_house",
        "build_fuel_plant",
        "build_lockworks_port",
        "build_quartermasters_office",
        "build_weapons_workshop",
      ]
    `);
  });
});
