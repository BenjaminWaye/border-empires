// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { initHudV2Flag } from "./client-hud-v2-flag.js";
import { dockTileActionMenuForHudV2, type TileDockDeps } from "./client-hud-v2-tile-dock.js";

const act = (id: string, extra: Partial<TileActionDef> = {}): TileActionDef =>
  ({ id, label: id, ...extra }) as TileActionDef;

const ABILITIES = [
  act("siphon_tile", { label: "Siphon", cost: "40 crystal", targetKey: "9,9", originKey: "4,7" }),
  act("aether_wall", { label: "Aether Wall", disabled: true, disabledReason: "Needs 60 crystal" })
];

const view = (crystal: readonly TileActionDef[] = ABILITIES): TileMenuView =>
  ({
    title: "Grassland (4, 7)", subtitle: "Yours", tabs: [], overviewLines: [], actions: [],
    buildings: [act("build_mine", { label: "Mine", cost: "200 gold" })],
    crystal
  }) as unknown as TileMenuView;

const side = (): HTMLElement => document.getElementById("hud-v2-build") as HTMLElement;
const click = (selector: string): void => {
  (document.querySelector(selector) as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

describe("Aether ▸ sidebar", () => {
  // The dock wires its click handlers once, to the first bar it sees: keep one DOM and reset with a fresh tile.
  const fired: Array<[string, string | undefined, string | undefined]> = [];
  const state = createInitialState();
  const deps: TileDockDeps = {
    tileActionMenuEl: document.createElement("div"),
    isMobile: () => false,
    handleTileAction: (id, targetKey, originKey) => { fired.push([id, targetKey, originKey]); },
    hideTileActionMenu: () => undefined,
    renderHud: () => undefined
  };
  const render = (crystal?: readonly TileActionDef[]): void => dockTileActionMenuForHudV2(state, view(crystal), deps, () => undefined);
  let tileX = 0;

  beforeAll(() => {
    initHudV2Flag("?hud=v2");
    document.body.innerHTML = `<div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><section id="hud-v2-build" hidden></section>`;
    deps.tileActionMenuEl = document.getElementById("tile-action-menu") as HTMLElement;
    state.tileActionMenu.mode = "single";
  });

  beforeEach(() => {
    fired.length = 0;
    tileX += 1;
    state.tileActionMenu.currentTileKey = `${tileX},7`;
    render();
  });

  it("opens in the Build sidebar, listing each ability with its cost or why it's unavailable", () => {
    expect(side().hidden).toBe(true);
    click('[data-hud-v2-panel="aether"]');
    expect(side().hidden).toBe(false);
    expect(document.body.classList.contains("hud-v2-building")).toBe(true);
    expect(side().getAttribute("aria-label")).toBe("Aether");
    expect(side().querySelector(".v2t-build-title")?.textContent).toBe("Aether");
    const rows = Array.from(side().querySelectorAll<HTMLButtonElement>(".hud-v2-aether-row"));
    expect(rows.map((r) => r.querySelector(".v2t-build-cost")?.textContent)).toEqual(["40 crystal", "Needs 60 crystal"]);
    expect(rows[1]?.disabled).toBe(true);
    expect(rows[0]?.querySelector("img")?.getAttribute("src")).toBe("/icons/abilities/siphon.svg");
    // No popover above the action row any more.
    expect(document.querySelector("#hud-v2-tile .hud-v2-pop")).toBeNull();
  });

  it("closes from its own button, like Build", () => {
    click('[data-hud-v2-panel="aether"]');
    click('[data-hud-v2-panel="aether"]');
    expect(side().hidden).toBe(true);
    expect(document.body.classList.contains("hud-v2-building")).toBe(false);
  });

  it("swaps with Build in the same sidebar", () => {
    click('[data-hud-v2-panel="build"]');
    expect(side().getAttribute("aria-label")).toBe("Build");
    click('[data-hud-v2-panel="aether"]');
    expect(side().hidden).toBe(false);
    expect(side().querySelector(".hud-v2-aether-row")).not.toBeNull();
    expect(side().querySelector("[data-v2-build-pick]")).toBeNull();
  });

  it("casts the picked ability and closes", () => {
    click('[data-hud-v2-panel="aether"]');
    click('#hud-v2-build [data-hud-v2-action="siphon_tile"]');
    expect(fired).toEqual([["siphon_tile", "9,9", "4,7"]]);
    expect(side().hidden).toBe(true);
  });

  it("closes when another tile is picked", () => {
    click('[data-hud-v2-panel="aether"]');
    state.tileActionMenu.currentTileKey = "99,7";
    render();
    expect(side().hidden).toBe(true);
    expect(document.body.classList.contains("hud-v2-building")).toBe(false);
  });

  // Regression: every tick repaints the panel; rewriting the list dropped a click pressed mid-tick and its scroll.
  it("keeps the same rows across a repaint of the same tile", () => {
    click('[data-hud-v2-panel="aether"]');
    const row = side().querySelector(".hud-v2-aether-row");
    render();
    expect(side().querySelector(".hud-v2-aether-row")).toBe(row);
  });

  it("closes when the tile no longer has abilities", () => {
    click('[data-hud-v2-panel="aether"]');
    render([]);
    expect(side().hidden).toBe(true);
    expect(document.body.classList.contains("hud-v2-building")).toBe(false);
    expect(document.querySelector('[data-hud-v2-panel="aether"]')).toBeNull();
  });
});
