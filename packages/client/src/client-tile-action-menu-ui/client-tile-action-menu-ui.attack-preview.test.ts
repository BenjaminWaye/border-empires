import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { openSingleTileActionMenu } from "./client-tile-action-menu-ui.js";
import { requestAttackPreviewForTarget } from "../client-queue-logic/client-queue-logic.js";
import type { Tile, TileMenuView } from "../client-types.js";

const makeMenuEl = (): HTMLDivElement =>
  ({
    innerHTML: "",
    offsetHeight: 360,
    style: {},
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => [])
  }) as unknown as HTMLDivElement;

const enemyTile = (): Tile => ({ x: 5, y: 7, terrain: "LAND", ownerId: "enemy", fogged: false });

const viewForTile = (tile: Tile): TileMenuView => ({
  title: `Tile (${tile.x}, ${tile.y})`,
  subtitle: "Enemy",
  tabs: ["actions"],
  overviewLines: [],
  actions: [{ id: "launch_attack", label: "Launch Attack" }],
  buildings: [],
  crystal: []
});

const deps = (requestAttackPreviewForTarget: (tile: Tile) => void) => ({
  tileActionMenuEl: makeMenuEl(),
  viewportSize: () => ({ width: 1200, height: 900 }),
  isMobile: () => false,
  hideTileActionMenu: vi.fn(),
  tileMenuViewForTile: viewForTile,
  handleTileAction: vi.fn(),
  cancelQueuedSettlement: vi.fn(() => false),
  cancelQueuedBuild: vi.fn(() => false),
  cancelQueuedAutoSettle: vi.fn(() => false),
  moveQueuedEntryToFront: vi.fn(() => false),
  cancelQueuedWaypointEntry: vi.fn(() => false),
  moveWaypointToFront: vi.fn(() => false),
  cancelQueuedExpandEntry: vi.fn(() => false),
  moveActionQueueEntryToFront: vi.fn(() => false),
  cancelOngoingCapture: vi.fn(),
  sendGameMessage: vi.fn(() => true),
  applyOptimisticStructureCancel: vi.fn(),
  clearSettlementProgressByKey: vi.fn(),
  renderHud: vi.fn(),
  requestAttackPreviewForTarget,
  keyFor: (x: number, y: number) => `${x},${y}`,
  isTileOwnedByAlly: () => false,
  pickOriginForTarget: () => undefined
});

describe("openSingleTileActionMenu attack preview request", () => {
  it("requests fresh attack preview by default for enemy tiles", () => {
    const state = createInitialState();
    state.me = "me";
    const requestAttackPreviewForTarget = vi.fn();

    openSingleTileActionMenu(state, enemyTile(), 100, 120, deps(requestAttackPreviewForTarget));

    expect(requestAttackPreviewForTarget).toHaveBeenCalledTimes(1);
  });

  it("can re-render timeout state without immediately restarting the preview request", () => {
    const state = createInitialState();
    state.me = "me";
    const requestAttackPreviewForTarget = vi.fn();

    openSingleTileActionMenu(state, enemyTile(), 100, 120, deps(requestAttackPreviewForTarget), { requestAttackPreview: false });

    expect(requestAttackPreviewForTarget).not.toHaveBeenCalled();
  });

  it("opens the panel for a fogged tile with stale enemy ownership without sending a live ATTACK_PREVIEW request", () => {
    const state = createInitialState();
    state.me = "me";
    const send = vi.fn();
    const ws = { readyState: 1, OPEN: 1, send } as unknown as Parameters<typeof requestAttackPreviewForTarget>[2]["ws"];
    const foggedEnemyTile: Tile = { x: 5, y: 7, terrain: "LAND", ownerId: "enemy", fogged: true };

    openSingleTileActionMenu(
      state,
      foggedEnemyTile,
      100,
      120,
      deps((tile) =>
        requestAttackPreviewForTarget(state, tile, {
          ws,
          authSessionReady: true,
          keyFor: (x: number, y: number) => `${x},${y}`,
          pickOriginForTarget: () => ({ x: 4, y: 7, terrain: "LAND", ownerId: "me", fogged: false })
        })
      )
    );

    expect(state.tileActionMenu.mode).toBe("single");
    expect(state.tileActionMenu.currentTileKey).toBe("5,7");
    expect(send).not.toHaveBeenCalled();
  });
});
