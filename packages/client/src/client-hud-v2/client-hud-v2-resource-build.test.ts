// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { tileActionMenuHtml } from "../client-tile-menu-html.js";
import { dockTileActionMenuForHudV2, type TileDockDeps } from "./client-hud-v2-tile-dock.js";

const act = (id: TileActionDef["id"], extra: Partial<TileActionDef> = {}): TileActionDef => ({ id, label: id, ...extra });
const view = (buildings: TileActionDef[], actions: TileActionDef[] = []): TileMenuView => ({
  title: "Resource (4, 7)", subtitle: "Yours", tabs: ["actions", "buildings"], overviewLines: [], actions, buildings, crystal: []
});
const click = (selector: string): void => {
  const button = document.querySelector<HTMLElement>(selector);
  expect(button).not.toBeNull();
  button!.click();
};
const primary = (): HTMLElement | null => document.querySelector("#hud-v2-tile .hud-v2-act-primary");
const selectedCategory = (): string | undefined => document.querySelector<HTMLElement>('[data-v2-build-category][aria-selected="true"]')?.dataset.v2BuildCategory;

describe("resource tile building flow", () => {
  const state = createInitialState();
  const fired: Array<[string, string | undefined]> = [];
  const deps: TileDockDeps = {
    tileActionMenuEl: document.createElement("div"), handleTileAction: (id, target) => { fired.push([id, target]); },
    hideTileActionMenu: () => undefined, renderHud: () => undefined
  };
  let tileX = 0;
  const render = (v: TileMenuView): void => dockTileActionMenuForHudV2(state, v, deps, () => undefined);
  beforeAll(() => {
    document.body.innerHTML = '<div id="tile-action-menu"></div><section id="hud-v2-tile"></section><section id="hud-v2-build" hidden></section>';
    deps.tileActionMenuEl = document.getElementById("tile-action-menu")!;
    state.tileActionMenu.mode = "single";
  });
  beforeEach(() => {
    state.tileActionMenu.currentTileKey = `${++tileX},7`;
    fired.length = 0;
  });

  it.each(["build_hydrogarden", "build_reclamation_works", "build_cultivation_estate"] as const)("makes %s primary and keeps it in Resource when Build is clicked", (id) => {
    const improvement = act(id, { targetKey: "4,7" });
    const v = view([act("build_fortification"), act("build_relay_beacon"), improvement]);
    render(v);
    expect(primary()?.dataset.hudV2Action).toBe(id);
    click('[data-hud-v2-panel="build"]');
    expect(selectedCategory()).toBe("resource");
    expect(document.querySelector(`[data-v2-build-pick="${id}"]`)).not.toBeNull();
    click(`[data-v2-build-pick="${id}"]`);
    click(`#hud-v2-build [data-hud-v2-action="${id}"]`);
    expect(fired).toEqual([[id, "4,7"]]);
    click(`#hud-v2-tile [data-hud-v2-action="${id}"]`);
    expect(fired).toEqual([[id, "4,7"], [id, "4,7"]]);
  });

  it.each(["Requires Hyperfeed Seedstock Consignment", "Tile already has structure", "Need a free FOOD slot"])("does not promote a blocked improvement: %s", (disabledReason) => {
    render(view([act("build_hydrogarden", { disabled: true, disabledReason }), act("build_relay_beacon")]));
    expect(primary()?.dataset.hudV2Action).toBe("build_relay_beacon");
  });

  it("keeps Garrison ahead of improvements on frontier resources", () => {
    render(view([act("build_hydrogarden"), act("build_relay_beacon")], [act("settle_land", { label: "Garrison", recommended: true })]));
    expect(primary()?.dataset.hudV2Action).toBe("settle_land");
  });

  it("preserves a chosen category until another tile is selected", () => {
    const v = view([act("build_hydrogarden"), act("build_fortification")]);
    render(v);
    click('[data-hud-v2-panel="build"]');
    click('[data-v2-build-category="military"]');
    render(v);
    expect(selectedCategory()).toBe("military");
    state.tileActionMenu.currentTileKey = "100,7";
    render(v);
    click('[data-hud-v2-panel="build"]');
    expect(selectedCategory()).toBe("resource");
  });

  it("also opens Resource first in the floating build menu", () => {
    const root = document.createElement("div");
    root.innerHTML = tileActionMenuHtml(view([act("build_fortification"), act("build_hydrogarden"), act("build_manufactory"), act("build_relay_beacon"), act("build_hydroworks"), act("build_sky_dock"), act("build_observatory")]), "buildings");
    expect(root.querySelector<HTMLInputElement>(".tile-building-category-radio[checked]")?.classList.contains("cat-resource")).toBe(true);
  });
});
