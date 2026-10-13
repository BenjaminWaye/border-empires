// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { renderTileActionMenu } from "../client-tile-action-menu-ui/client-tile-action-menu-ui.js";
import type { TileMenuView } from "../client-types.js";
import { recordMusterCombatReport } from "./client-muster-combat-reports.js";

it("keeps the report being read at the same position when new results arrive", () => {
  localStorage.clear();
  const state = createInitialState(); state.me = "me"; state.joinSeasonId = "test-season";
  state.tiles.set("3,3", { x: 3, y: 3, terrain: "LAND", fogged: false, ownerId: "me", muster: { ownerId: "me", amount: 60, mode: "HOLD", updatedAt: 0 } });
  state.tileActionMenu.mode = "single"; state.tileActionMenu.currentTileKey = "3,3"; state.tileActionMenu.activeTab = "reports";
  const root = document.createElement("div"); document.body.append(root);
  const view = (): TileMenuView => ({ title: "Flag", subtitle: "Your land", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] });
  const no = () => false; const noop = () => {};
  const deps: Parameters<typeof renderTileActionMenu>[4] = {
    tileActionMenuEl: root, viewportSize: () => ({ width: 390, height: 844 }), isMobile: () => true,
    hideTileActionMenu: noop, tileMenuViewForTile: view, handleTileAction: noop,
    cancelQueuedSettlement: no, cancelQueuedBuild: no, cancelQueuedAutoSettle: no, moveQueuedEntryToFront: no,
    cancelQueuedWaypointEntry: no, moveWaypointToFront: no, cancelQueuedExpandEntry: no, moveActionQueueEntryToFront: no,
    cancelOngoingCapture: noop, sendGameMessage: no, applyOptimisticStructureCancel: noop,
    clearSettlementProgressByKey: noop, renderHud: noop, requestAttackPreviewForTarget: noop,
    keyFor: (x, y) => `${x},${y}`, isTileOwnedByAlly: no, pickOriginForTarget: () => undefined
  };
  const record = (id: string) => recordMusterCombatReport(state, { commandId: id, target: { x: 4, y: 3 }, manpowerDelta: -60 }, "3,3", { title: id, detail: "Battle", tone: "warn" });
  const rectangles = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("muster-report")) {
      const body = this.closest<HTMLElement>("[data-tile-menu-scroll]");
      const rows = Array.from(body?.querySelectorAll(".muster-report") ?? []);
      return new DOMRect(0, rows.indexOf(this) * 100 - (body?.scrollTop ?? 0), 320, 100);
    }
    return new DOMRect(0, 0, 320, 200);
  });
  try {
    record("one"); record("two"); renderTileActionMenu(state, view(), 10, 80, deps);
    const body = root.querySelector<HTMLElement>("[data-tile-menu-scroll]")!; body.scrollTop = 150;
    const detail = Array.from(root.querySelectorAll<HTMLDetailsElement>("details")).find((row) => row.dataset.musterReportId === "one")!;
    detail.open = true;
    record("three"); renderTileActionMenu(state, view(), 10, 80, deps);
    expect(root.querySelector<HTMLElement>("[data-tile-menu-scroll]")?.scrollTop).toBe(250);
    expect(root.querySelector<HTMLDetailsElement>("details[open]")?.dataset.musterReportId).toBe("one");
  } finally { rectangles.mockRestore(); root.remove(); }
});
