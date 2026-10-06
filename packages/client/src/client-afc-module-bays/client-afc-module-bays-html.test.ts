// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TechInfo } from "../client-tech-info-types.js";
import type { Tile } from "../client-types.js";
import { bindAfcModuleBays } from "./client-afc-module-bays-bind.js";
import { afcModuleBaysHtml } from "./client-afc-module-bays-html.js";
import { afcModuleBaysView } from "./client-afc-module-bays-model.js";

const CATALOG = [
  { id: "masonry", name: "Titanium Forge Module", branch: "war", tier: 1, description: "AFC module: forges plate.", mods: {}, requirements: { gold: 0, resources: {} }, manifestCategory: "AFC_MODULE" },
  { id: "workshops", name: "Umbrite Synthesis Module", branch: "economy", tier: 1, description: "", mods: {}, requirements: { gold: 0, resources: {} }, manifestCategory: "AFC_MODULE" }
] as TechInfo[];

const renderMenu = (): HTMLElement => {
  const tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: ["masonry"], houseModules: ["masonry"] } } as Tile;
  const view = afcModuleBaysView({ me: "me", techIds: ["masonry", "workshops"], techCatalog: CATALOG, tiles: new Map([["1,1", tile]]) }, tile);
  const menu = document.createElement("div");
  menu.innerHTML = afcModuleBaysHtml(view);
  return menu;
};

describe("Modules tab", () => {
  it("draws 8 bay buttons, one docked and seven empty", () => {
    const menu = renderMenu();
    const bays = Array.from(menu.querySelectorAll<HTMLButtonElement>("button[data-afc-bay]"));
    expect(bays).toHaveLength(8);
    expect(bays[0]?.className).toContain("is-docked");
    expect(bays[0]?.textContent).toBe("TF");
    expect(bays.slice(1).every((bay) => bay.className.includes("is-empty"))).toBe(true);
    expect(menu.textContent).toContain("1/8 bays in use");
  });

  it("tapping an empty bay shows its Call down list; tapping a module shows what it does", () => {
    const menu = renderMenu();
    bindAfcModuleBays(menu, "1,1");
    const detail = (index: number) => menu.querySelector<HTMLElement>(`[data-afc-bay-detail="${index}"]`)!;
    expect(detail(3).hidden).toBe(true);

    menu.querySelector<HTMLButtonElement>('button[data-afc-bay="3"]')!.click();
    expect(detail(3).hidden).toBe(false);
    expect(detail(3).querySelector<HTMLButtonElement>("button[data-action]")?.dataset.action).toBe("redeploy_afc_module:workshops");
    expect(detail(3).textContent).toContain("Lands in 1m");

    menu.querySelector<HTMLButtonElement>('button[data-afc-bay="0"]')!.click();
    expect(detail(3).hidden).toBe(true);
    expect(detail(0).hidden).toBe(false);
    expect(detail(0).textContent).toContain("forges plate.");
  });

  it("keeps the selected bay across a re-render of the same AFC, and resets it for another AFC", () => {
    const menu = renderMenu();
    bindAfcModuleBays(menu, "1,1");
    menu.querySelector<HTMLButtonElement>('button[data-afc-bay="2"]')!.click();

    menu.innerHTML = renderMenu().innerHTML;
    bindAfcModuleBays(menu, "1,1");
    expect(menu.querySelector<HTMLElement>('[data-afc-bay-detail="2"]')!.hidden).toBe(false);

    bindAfcModuleBays(menu, "5,5");
    expect(menu.querySelector<HTMLElement>('[data-afc-bay-detail="2"]')!.hidden).toBe(true);
  });
});
