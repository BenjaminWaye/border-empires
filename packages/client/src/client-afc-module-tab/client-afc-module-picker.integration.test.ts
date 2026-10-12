// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { renderTileActionMenu } from "../client-tile-action-menu-ui/client-tile-action-menu-ui.js";
import { handleAfcTileAction } from "../client-afc-tile-action.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import { afcModuleTabForTile } from "./client-afc-module-tab.js";
import type { TechInfo, Tile, TileMenuView } from "../client-types.js";

const catalog: TechInfo[] = ["masonry", "workshops", "radar"].map((id) => ({ id, name: id, branch: "economy", tier: 1, description: "", mods: {}, requirements: { gold: 0, resources: {} }, manifestCategory: "AFC_MODULE" }));
const tile: Tile = { x: 5, y: 6, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: ["masonry"], houseModules: ["masonry"], incomingModules: [{ techId: "workshops", arrivesAt: 31_000 }] } };
const menuView = (nowMs = 1000): TileMenuView => ({ title: "AFC (5, 6)", subtitle: "", tabs: ["modules", "overview"], overviewLines: [], actions: [], buildings: [], crystal: [], modules: afcModuleTabForTile(tile, catalog, [{ id: "redeploy_afc_module:radar", label: "Call down Radar" }], "me", nowMs)! });

type PickerHarness = {
  root: HTMLDivElement;
  state: ClientState;
  send: Mock<() => boolean>;
  render: (view?: TileMenuView) => void;
};

const setup = (): PickerHarness => {
  const root = document.createElement("div");
  document.body.append(root);
  const state = createInitialState();
  state.me = "me";
  state.tileActionMenu.currentTileKey = "5,6";
  state.tileActionMenu.activeTab = "modules";
  state.tiles.set("5,6", tile);
  const send = vi.fn(() => true);
  const hide = (): void => { state.tileActionMenu.visible = false; root.style.display = "none"; };
  const deps: Parameters<typeof renderTileActionMenu>[4] = {
    tileActionMenuEl: root,
    viewportSize: () => ({ width: 390, height: 900 }),
    isMobile: () => true,
    hideTileActionMenu: hide,
    tileMenuViewForTile: () => menuView(),
    handleTileAction: (actionId) => { handleAfcTileAction({ actionId, selected: tile, sendGameMessage: send, hideMenu: hide, armAfcLanding: vi.fn() }); },
    cancelQueuedSettlement: () => false,
    cancelQueuedBuild: () => false,
    cancelQueuedAutoSettle: () => false,
    moveQueuedEntryToFront: () => false,
    cancelQueuedWaypointEntry: () => false,
    moveWaypointToFront: () => false,
    cancelQueuedExpandEntry: () => false,
    moveActionQueueEntryToFront: () => false,
    cancelOngoingCapture: () => {},
    sendGameMessage: () => true,
    applyOptimisticStructureCancel: () => {},
    clearSettlementProgressByKey: () => {},
    renderHud: () => {},
    requestAttackPreviewForTarget: () => {},
    keyFor: (x, y) => `${x},${y}`,
    isTileOwnedByAlly: () => false,
    pickOriginForTarget: () => undefined
  };
  const render = (view = menuView()): void => renderTileActionMenu(state, view, 10, 10, deps);
  render();
  return { root, state, send, render };
};

describe("AFC slot picker tile-menu integration", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("opens choices only for the clicked slot and sends the existing command on selection", () => {
    const { root, state, send } = setup();
    const picker = root.querySelector<HTMLElement>(".afc-slot-picker")!;
    expect(picker.hidden).toBe(true);
    const trigger = root.querySelector<HTMLButtonElement>('button[data-afc-call-down="6"]')!;
    trigger.click();
    expect(picker.hidden).toBe(false);
    expect(picker.parentElement).toBe(trigger.parentElement);
    expect(picker.querySelector(".tile-action-icon")?.textContent).toBe("⇣");
    picker.querySelector<HTMLButtonElement>('button[data-action="redeploy_afc_module:radar"]')!.click();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: "REDEPLOY_AFC_MODULE", x: 5, y: 6, techId: "radar" });
    expect(picker.hidden).toBe(true);
    expect(state.tileActionMenu.visible).toBe(false);
  });

  it("survives a real countdown rerender, but reopens closed after the menu is hidden", () => {
    const { root, state, render } = setup();
    root.querySelector<HTMLButtonElement>('button[data-afc-call-down="6"]')!.click();
    const original = root.querySelector<HTMLElement>(".afc-slot-picker")!;
    render(menuView(2000));
    const refreshed = root.querySelector<HTMLElement>(".afc-slot-picker")!;
    expect(refreshed).not.toBe(original);
    expect(refreshed.hidden).toBe(false);
    expect(root.querySelector('[aria-expanded="true"]')?.getAttribute("data-afc-call-down")).toBe("6");
    expect(document.activeElement?.getAttribute("data-action")).toBe("redeploy_afc_module:radar");
    state.tileActionMenu.visible = false;
    render(menuView(3000));
    expect(root.querySelector<HTMLElement>(".afc-slot-picker")!.hidden).toBe(true);
  });

  it("fits the picker to a short menu viewport and refits reused markup on resize", () => {
    const { root, render } = setup();
    const body = root.querySelector<HTMLElement>("[data-tile-menu-scroll]")!;
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 180 });
    root.querySelector<HTMLButtonElement>('button[data-afc-call-down="6"]')!.click();
    const picker = root.querySelector<HTMLElement>(".afc-slot-picker")!;
    expect(picker.style.getPropertyValue("--afc-picker-height")).toBe("180px");
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 120 });
    render();
    expect(root.querySelector(".afc-slot-picker")).toBe(picker);
    expect(picker.style.getPropertyValue("--afc-picker-height")).toBe("120px");
    expect(picker.hidden).toBe(false);
  });
});
