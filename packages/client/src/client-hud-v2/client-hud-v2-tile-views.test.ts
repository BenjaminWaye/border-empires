// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { dockTileActionMenuForHudV2, type TileDockDeps } from "./client-hud-v2-tile-dock.js";

// 2026-11-16 playtest: a muster flag's "Reports ▸" expanded the old legacy tile menu (on its Attack tab).
// Its views now open in the new HUD's sidebar, and the legacy menu is never expanded.
const muster = { ownerId: "me", amount: 40, mode: "HOLD" as const, updatedAt: 0 };
const commit = { mode: "HOLD" as const, hasTarget: false, floor: 60, cap: 300, commitManpower: 60, presets: [{ key: "normal" as const, label: "Normal", amount: 60 }, { key: "double" as const, label: "Double", amount: 120 }] };
const report = { id: "r1", flagKey: "4,7", at: 0, title: "Took (5, 7)", detail: "Lost 3 manpower.", targetX: 5, targetY: 7, won: true, manpowerDelta: -3, coins: 0, read: false };

const view = (over: Partial<TileMenuView> = {}): TileMenuView =>
  ({
    title: "Tundra (4, 7)", subtitle: "Your frontier", tabs: ["actions", "commit", "overview", "reports"], overviewLines: [],
    actions: [{ id: "muster_clear", label: "Clear Muster" } as TileActionDef], buildings: [], crystal: [],
    commit, musterReports: { flagKey: "4,7", reports: [report], unread: 1 }, ...over
  }) as unknown as TileMenuView;

const side = (): HTMLElement => document.getElementById("hud-v2-build") as HTMLElement;
const menu = (): HTMLElement => document.getElementById("tile-action-menu") as HTMLElement;
const click = (selector: string): void => {
  (document.querySelector(selector) as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

describe("tile views in the sidebar", () => {
  const sent: unknown[] = [];
  let online = true;
  const fired: string[] = [];
  const state = createInitialState();
  const deps: TileDockDeps = {
    tileActionMenuEl: document.createElement("div"),
    handleTileAction: (id) => { fired.push(id); },
    hideTileActionMenu: () => undefined,
    renderHud: () => undefined,
    sendGameMessage: (payload) => { sent.push(payload); return online; }
  };
  const render = (over?: Partial<TileMenuView>): void => dockTileActionMenuForHudV2(state, view(over), deps, () => undefined);

  beforeAll(() => {
    document.body.innerHTML = `<div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><section id="hud-v2-build" hidden></section>`;
    deps.tileActionMenuEl = menu();
    state.me = "me";
    state.tileActionMenu.mode = "single";
  });

  beforeEach(() => {
    sent.length = 0;
    online = true;
    fired.length = 0;
    // A fresh tile each test resets the dock's open panel.
    state.tileActionMenu.currentTileKey = `${Math.random()}`;
    render();
    state.tileActionMenu.currentTileKey = "4,7";
    state.tiles.set("4,7", { x: 4, y: 7, terrain: "LAND", ownerId: "me", muster });
    render();
  });

  it("opens Combat reports in the sidebar, not the legacy menu", () => {
    click('[data-hud-v2-panel="reports"]');
    expect(side().hidden).toBe(false);
    expect(side().getAttribute("aria-label")).toBe("Combat reports");
    expect(side().textContent).toContain("Took (5, 7)");
    expect(side().querySelector("[data-muster-commit-slider]")).toBeNull();
    expect(state.tileActionMenu.activeTab).not.toBe("reports");
  });

  it("opens Attack commitment in the sidebar and saves from there", () => {
    click('[data-hud-v2-panel="commit"]');
    expect(side().getAttribute("aria-label")).toBe("Attack commitment");
    click('[data-muster-commit-preset="120"]');
    expect(side().querySelector("[data-muster-commit-value]")?.textContent).toBe("120");
    click("[data-muster-commit-save]");
    expect(sent).toEqual([{ type: "SET_MUSTER", x: 4, y: 7, mode: "HOLD", commitManpower: 120 }]);
    expect(state.tileActionMenu.activeTab).not.toBe("commit");
  });

  it("keeps an unsaved pick when a tick repaints the view", () => {
    click('[data-hud-v2-panel="commit"]');
    click('[data-muster-commit-preset="120"]');
    render({ commit: { ...commit, cap: 310 } });
    expect(side().querySelector<HTMLInputElement>("[data-muster-commit-slider]")?.value).toBe("120");
  });

  it("closes the view once the tile loses it", () => {
    click('[data-hud-v2-panel="reports"]');
    render({ tabs: ["actions", "overview"] });
    expect(side().hidden).toBe(true);
  });

  it("closes from its own ✕", () => {
    click('[data-hud-v2-panel="commit"]');
    click('[data-hud-v2-panel-close="commit"]');
    expect(side().hidden).toBe(true);
  });

  it("opens an AFC's Modules in the sidebar and calls a module down from its socket picker", () => {
    const modules = {
      owned: true, active: true,
      slots: [{ state: "empty" as const, detail: "Empty" }],
      actions: [{ id: "afc_call_down_x", label: "Call down Forge" } as unknown as TileActionDef]
    };
    render({ tabs: ["modules", "actions"], modules });
    click('[data-hud-v2-panel="modules"]');
    expect(side().getAttribute("aria-label")).toBe("Modules");
    click("[data-afc-call-down]");
    expect(side().querySelector<HTMLElement>(".afc-slot-picker")?.hidden).toBe(false);
    click('.afc-slot-picker [data-action="afc_call_down_x"]');
    expect(fired).toEqual(["afc_call_down_x"]);
    expect(state.tileActionMenu.activeTab).not.toBe("modules");
  });

  it("keeps the list's scroll when a tick repaints the view", () => {
    click('[data-hud-v2-panel="reports"]');
    const list = side().querySelector<HTMLElement>(".hud-v2-tile-view")!;
    list.scrollTop = 140;
    render({ musterReports: { flagKey: "4,7", reports: [report, { ...report, id: "r2", title: "Took (6, 7)" }], unread: 2 } });
    expect(side().querySelector<HTMLElement>(".hud-v2-tile-view")).not.toBe(list);
    expect(side().querySelector<HTMLElement>(".hud-v2-tile-view")?.scrollTop).toBe(140);
  });

  it("keeps an unsaved pick when Save could not send", () => {
    online = false;
    click('[data-hud-v2-panel="commit"]');
    click('[data-muster-commit-preset="120"]');
    click("[data-muster-commit-save]");
    render({ commit: { ...commit, cap: 310 } });
    expect(side().querySelector<HTMLInputElement>("[data-muster-commit-slider]")?.value).toBe("120");
  });

  it("drops an unsaved pick the new range no longer allows", () => {
    click('[data-hud-v2-panel="commit"]');
    click('[data-muster-commit-preset="120"]');
    render({ commit: { ...commit, floor: 150, commitManpower: 150 } });
    const slider = side().querySelector<HTMLInputElement>("[data-muster-commit-slider]")!;
    expect(slider.value).toBe("150");
    expect(slider.dataset.musterCommitDirty).toBeUndefined();
  });
});
