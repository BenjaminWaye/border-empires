// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scene } from "three";
import { createFabricationComplexOverlay } from "../client-map-3d-fabrication-complex.js";
import { afcModulePickerStateForTitle, afcModuleTabForTile, bindAfcModulePicker } from "./client-afc-module-tab.js";
import { tileActionMenuHtml } from "../client-tile-menu-html.js";
import { tileMenuRenderSignature } from "../client-tile-menu-render-signature/client-tile-menu-render-signature.js";
import { handleAfcTileAction } from "../client-afc-tile-action.js";
import { afcModuleActionsForTile } from "../client-afc-actions.js";
import { createInitialState } from "../client-state/client-state.js";
import { tileMenuViewForTile } from "../client-tile-menu-view/client-tile-menu-view.js";
import type { TechInfo, Tile, TileMenuView } from "../client-types.js";

const tech = (id: string, name: string): TechInfo => ({ id, name, branch: "economy", tier: 1, description: "", mods: {}, requirements: { gold: 0, resources: {} }, manifestCategory: "AFC_MODULE" });
const catalog = [tech("masonry", "Titanium Forge"), tech("workshops", "Umbrite Synthesis"), tech("radar", "Radar <core>")];
const target: Tile = { x: 5, y: 6, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active", modules: ["masonry"], houseModules: ["masonry"] } } as Tile;
const availability = (enabled: boolean, reason: string, detail?: string) => ({ disabled: !enabled, disabledReason: reason, ...(detail ? { detail } : {}) });
const stateFor = () => {
  const state = createInitialState();
  state.me = "me";
  state.techCatalog = catalog;
  state.techIds = catalog.map((entry) => entry.id);
  state.tiles.set("5,6", target);
  state.tiles.set("2,3", { ...target, x: 2, y: 3, afc: { ownerId: "me", status: "active", modules: ["workshops"], houseModules: ["workshops"] } });
  return state;
};
const viewFor = (tile = target): TileMenuView => ({ title: "AFC", subtitle: "", tabs: ["modules"], overviewLines: [], actions: [], buildings: [], crystal: [], modules: afcModuleTabForTile(tile, catalog, afcModuleActionsForTile(stateFor(), tile, availability), "me", 1000)! });

describe("graphical AFC modules tab", () => {
  beforeEach(() => document.body.replaceChildren());
  it("matches every socket position to the actual 3D attachment ring", () => {
    const overlay = createFabricationComplexOverlay(new Scene(), 1);
    overlay.addInstance(0, 0, 0, target.x, target.y);
    const root = document.createElement("div");
    root.innerHTML = tileActionMenuHtml(viewFor(), "modules", false);
    const sockets = Array.from(root.querySelectorAll<HTMLElement>(".afc-socket-cell"));
    const gridOffset = (coordinate: number): number => Math.abs(coordinate) < 0.000001 ? 0 : Math.sign(coordinate);
    try {
      overlay.moduleSocketAttachments(0).forEach((attachment, index) => {
        expect(sockets[index]?.style.gridColumn).toBe(String(3 + gridOffset(attachment.x)));
        expect(sockets[index]?.style.gridRow).toBe(String(3 + gridOffset(attachment.z)));
      });
    } finally {
      overlay.dispose();
    }
  });

  it("emits the tab and named module state through the real tile-menu view builder", () => {
    const view = tileMenuViewForTile(target, {
      state: stateFor(),
      menuActionsForSingleTile: (tile) => afcModuleActionsForTile(stateFor(), tile, availability),
      splitTileActionsIntoTabs: (actions) => ({ actions, buildings: [], crystal: [] }),
      settlementProgressForTile: () => undefined,
      captureProgressForTile: () => undefined,
      queuedSettlementProgressForTile: () => undefined,
      queuedBuildProgressForTile: () => undefined,
      queuedExpandProgressForTile: () => undefined,
      queuedWaypointProgressForTile: () => undefined,
      queuedAutoSettleNextForTile: () => undefined,
      constructionProgressForTile: () => undefined,
      menuOverviewForTile: () => [],
      prettyToken: (value) => value,
      playerNameForOwner: () => undefined,
      terrainLabel: () => "Land",
      isTileOwnedByAlly: () => false
    });
    expect(view.tabs).toContain("modules");
    // The Modules tab replaces Overview for AFCs, like a town's stat grid.
    expect(view.tabs).not.toContain("overview");
    expect(view.actions).toEqual([]);
    expect(view.modules?.slots[0]?.name).toBe("Titanium Forge");
  });

  it("maps modules in socket order and offers unlocked copies from another AFC", () => {
    const view = viewFor();
    expect(view.modules?.slots).toHaveLength(8);
    expect(view.modules?.slots[0]).toMatchObject({ name: "Titanium Forge", state: "house" });
    expect(view.modules?.actions.map((action) => action.id)).toEqual(["redeploy_afc_module:workshops", "redeploy_afc_module:radar"]);
    const root = document.createElement("div");
    root.innerHTML = tileActionMenuHtml(view, "modules", true);
    expect(root.querySelectorAll(".afc-socket")).toHaveLength(8);
    expect(root.querySelector(".tile-overview-card")).toBeNull();
    expect(root.querySelector(".afc-socket-cell")?.getAttribute("style")).toContain("grid-column:4;grid-row:3");
    const button = root.querySelector<HTMLButtonElement>('button[data-action="redeploy_afc_module:workshops"]')!;
    document.body.append(root);
    const picker = root.querySelector<HTMLElement>(".afc-module-call-down")!;
    expect(picker.hidden).toBe(true);
    picker.scrollIntoView = vi.fn();
    bindAfcModulePicker(root);
    const trigger = root.querySelector<HTMLButtonElement>("button[data-afc-call-down]")!;
    trigger.click();
    expect(picker.hidden).toBe(false);
    expect(picker.parentElement).toBe(trigger.parentElement);
    expect(picker.textContent).toContain("Call down · Socket 2");
    expect(picker.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    const sendGameMessage = vi.fn(() => true);
    button.onclick = () => handleAfcTileAction({ actionId: button.dataset.action!, selected: target, sendGameMessage, hideMenu: vi.fn(), armAfcLanding: vi.fn() });
    button.click();
    expect(picker.hidden).toBe(true);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "REDEPLOY_AFC_MODULE", x: 5, y: 6, techId: "workshops" });
    expect(root.innerHTML).toContain("Radar &lt;core&gt;");
  });

  it("switches to the clicked slot and dismisses on toggle, close, Escape or outside click", () => {
    const root = document.createElement("div");
    document.body.append(root);
    root.innerHTML = tileActionMenuHtml(viewFor(), "modules", true);
    const picker = root.querySelector<HTMLElement>(".afc-slot-picker")!;
    picker.scrollIntoView = vi.fn();
    bindAfcModulePicker(root);
    const [first, second] = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-afc-call-down]"));
    first!.click();
    second!.click();
    expect(first!.getAttribute("aria-expanded")).toBe("false");
    expect(second!.getAttribute("aria-expanded")).toBe("true");
    expect(picker.parentElement).toBe(second!.parentElement);
    expect(root.querySelectorAll(".is-selected")).toHaveLength(1);
    second!.click();
    expect(picker.hidden).toBe(true);
    first!.click();
    picker.querySelector<HTMLButtonElement>("button[data-afc-picker-close]")!.click();
    expect(picker.hidden).toBe(true);
    expect(document.activeElement).toBe(first);
    first!.click();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(picker.hidden).toBe(true);
    expect(document.activeElement).toBe(first);
    first!.click();
    root.querySelector<HTMLElement>(".tile-action-title")!.click();
    expect(picker.hidden).toBe(true);
  });

  it("preserves an open picker through a same-tile refresh, but not a filled slot or another tile", () => {
    const root = document.createElement("div");
    document.body.append(root);
    root.innerHTML = tileActionMenuHtml(viewFor(), "modules", false);
    const picker = root.querySelector<HTMLElement>(".afc-slot-picker")!;
    picker.scrollIntoView = vi.fn();
    bindAfcModulePicker(root);
    root.querySelector<HTMLButtonElement>("button[data-afc-call-down]")!.click();
    picker.scrollTop = 40;
    const radar = picker.querySelector<HTMLButtonElement>('button[data-action="redeploy_afc_module:radar"]')!;
    radar.focus();
    const previous = afcModulePickerStateForTitle(root, "AFC");
    expect(previous).toMatchObject({ slot: "2", scrollTop: 40, focusedActionId: "redeploy_afc_module:radar" });
    expect(afcModulePickerStateForTitle(root, "AFC (other tile)")).toBeUndefined();
    root.innerHTML = tileActionMenuHtml(viewFor(), "modules", false);
    bindAfcModulePicker(root, previous);
    const restored = root.querySelector<HTMLElement>(".afc-slot-picker")!;
    expect(restored.hidden).toBe(false);
    expect(restored.scrollTop).toBe(40);
    expect(document.activeElement?.getAttribute("data-action")).toBe("redeploy_afc_module:radar");
    const filled = { ...target, afc: { ...target.afc!, modules: ["masonry", "workshops"], houseModules: ["masonry", "workshops"] } };
    root.innerHTML = tileActionMenuHtml(viewFor(filled), "modules", false);
    bindAfcModulePicker(root, previous);
    expect(root.querySelector<HTMLElement>(".afc-slot-picker")!.hidden).toBe(true);
  });

  it("reserves incoming sockets, labels captured copies, and excludes present modules", () => {
    const tile = { ...target, afc: { ...target.afc!, houseModules: [], incomingModules: [{ techId: "workshops", arrivesAt: 31_000 }] } };
    const view = viewFor(tile);
    expect(view.modules?.slots[0]?.state).toBe("captured");
    expect(view.modules?.slots[1]).toMatchObject({ state: "incoming", detail: "Incoming · 30s" });
    expect(view.modules?.actions.map((action) => action.id)).toEqual(["redeploy_afc_module:radar"]);
    expect(tileMenuRenderSignature(view, "modules")).not.toEqual(tileMenuRenderSignature(viewFor(), "modules"));
  });

  it("keeps keyboard focus available when every module choice is disabled", () => {
    const view = viewFor();
    for (const action of view.modules!.actions) { action.disabled = true; action.disabledReason = "Unavailable right now"; }
    const root = document.createElement("div");
    document.body.append(root);
    root.innerHTML = tileActionMenuHtml(view, "modules", true);
    const picker = root.querySelector<HTMLElement>(".afc-slot-picker")!;
    picker.scrollIntoView = vi.fn();
    bindAfcModulePicker(root);
    root.querySelector<HTMLButtonElement>("button[data-afc-call-down]")!.click();
    expect(picker.hidden).toBe(false);
    expect(document.activeElement).toBe(picker.querySelector("button[data-afc-picker-close]"));
  });

  it("offers no call-down controls when full, foreign, dormant, or all unlocked types are present", () => {
    const full = viewFor({ ...target, afc: { ...target.afc!, modules: Array(8).fill("masonry") } });
    expect(full.modules?.actions).toEqual([]);
    expect(tileActionMenuHtml(full, "modules", false)).toContain("All sockets are occupied");
    for (const afc of [{ ...target.afc!, ownerId: "other" }, { ...target.afc!, status: "inactive" as const }, { ...target.afc!, modules: catalog.map((entry) => entry.id) }]) {
      expect(viewFor({ ...target, afc }).modules?.actions).toEqual([]);
    }
    const plain: Tile = { x: 5, y: 6, terrain: "LAND", ownerId: "me" };
    expect(afcModuleTabForTile(plain, catalog, [], "me")).toBeUndefined();
  });

  it("renders the tile's overview details beneath the socket diagram", () => {
    const root = document.createElement("div");
    root.innerHTML = tileActionMenuHtml({ ...viewFor(), overviewLines: [{ html: "Upkeep: 2 gold/m" }] }, "modules", true);
    const panel = root.querySelector(".afc-module-panel");
    const overview = root.querySelector(".tile-overview-card");
    expect(overview?.textContent).toContain("Upkeep: 2 gold/m");
    expect(panel && overview && panel.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
