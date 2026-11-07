// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { queueDevelopmentAction } from "../client-development-queue/client-development-queue.js";
import { processDevelopmentQueue, sendDevelopmentBuild } from "../client-queue-logic/client-development-dispatch.js";
import { handleGenericBuildAction } from "../client-generic-build-action.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { buildPlaceHtml } from "./client-hud-v2-build-list.js";
import { preserveResourceBuildChoice, resourceBuildChecked } from "./client-resource-improvement-action.js";

type ClientQueueEntry = ReturnType<typeof createInitialState>["developmentQueue"][number];

const view: TileMenuView = { title: "", subtitle: "", tabs: [], overviewLines: [], actions: [], buildings: [{ id: "build_mine", label: "Mine" }], crystal: [] };
const tile = (x: number, extra: Partial<Tile> = {}): Tile => ({ x, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "TITANIUM", ...extra });

describe("resource Place checkbox", () => {
  it("sends the same improvement to eligible garrisoned deposits only", () => {
    const state = createInitialState();
    state.me = "me";
    const tiles = [tile(1), tile(2), tile(3, { resource: "CRYSTAL" }), tile(4, { ownerId: "rival" }), tile(5, { ownershipState: "FRONTIER" }), tile(6, { optimisticPending: "settle" }), tile(7)];
    for (const t of tiles) state.tiles.set(`${t.x},2`, t);
    const handleBuildAction = vi.fn();
    const queued: number[] = [];
    const run = (checked: boolean) => handleGenericBuildAction({
      state, actionId: "build_mine", selected: tiles[0]!, buildAllResources: checked,
      viewForTile: (t) => t.x === 7 ? { ...view, buildings: [{ id: "build_mine", label: "Mine", disabled: true }] } : view,
      queueDevelopmentAction: (entry) => { queued.push(entry.x); return true; },
      handleBuildAction, pushFeed: vi.fn(), hideMenu: vi.fn()
    });
    run(false);
    expect(handleBuildAction.mock.calls.map((c) => c[2].x)).toEqual([1]);
    handleBuildAction.mockClear();
    run(true);
    expect(queued).toEqual([1, 2]);
    expect(handleBuildAction).not.toHaveBeenCalled();
  });

  it("queues every deposit durably and dispatches just one while the only free slot is awaiting acknowledgement", () => {
    const state = createInitialState();
    state.me = "me";
    const tiles = Array.from({ length: 10 }, (_, i) => tile(i));
    for (const t of tiles) state.tiles.set(`${t.x},2`, t);
    const sendGameMessage = vi.fn<(payload: unknown) => boolean>(() => true);
    const messagesOfType = (type: string) => sendGameMessage.mock.calls.filter(([message]) =>
      typeof message === "object" && message !== null && "type" in message && message.type === type);
    const pushFeed = vi.fn();
    const renderHud = vi.fn();
    const queue = (entry: ClientQueueEntry) => queueDevelopmentAction(state, entry, { sendGameMessage, pushFeed, renderHud });
    handleGenericBuildAction({ state, actionId: "build_mine", selected: tiles[0]!, buildAllResources: true,
      viewForTile: () => view, queueDevelopmentAction: queue, handleBuildAction: vi.fn(), pushFeed, hideMenu: vi.fn() });
    expect(state.developmentQueue).toHaveLength(10);
    expect(messagesOfType("DEV_QUEUE_ENQUEUE")).toHaveLength(10);
    const summary = () => ({ busy: 0, available: 1, limit: 1 });
    const dispatch = () => processDevelopmentQueue(state, {
      ws: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, readyState: 1, send: vi.fn(), close: vi.fn(), reconnect: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }, authSessionReady: true,
      developmentSlotSummary: summary, requestSettlement: vi.fn(() => false),
      sendDevelopmentBuild: (payload, optimistic, opts) => sendDevelopmentBuild(state, payload, optimistic, opts, {
        keyFor: (x, y) => `${x},${y}`, queueDevelopmentAction: queue, developmentSlotSummary: summary,
        developmentSlotReason: () => "Busy", renderHud, sendGameMessage, pushFeed, showCaptureAlert: vi.fn()
      }),
      applyOptimisticStructureBuild: vi.fn(), applyOptimisticStructureRemoval: vi.fn(), pushFeed, renderHud, sendGameMessage
    });
    expect(dispatch()).toBe(true);
    expect(dispatch()).toBe(false);
    expect(state.developmentQueue).toHaveLength(9);
    expect(messagesOfType("BUILD_ECONOMIC_STRUCTURE")).toHaveLength(1);
  });

  it("paces single support builds as well as bulk improvements", () => {
    const state = createInitialState();
    state.me = "me";
    const support: Tile = { x: 10, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
    const handleBuildAction = vi.fn();
    const queue = vi.fn((entry: ClientQueueEntry) => queueDevelopmentAction(state, entry, { renderHud: vi.fn(), pushFeed: vi.fn() }));
    handleGenericBuildAction({ state, selected: support, actionId: "build_manufactory", queueDevelopmentAction: queue,
      handleBuildAction, pushFeed: vi.fn(), hideMenu: vi.fn() });
    expect(handleBuildAction).not.toHaveBeenCalled();
    expect(state.developmentQueue).toEqual([expect.objectContaining({ tileKey: "10,2", kind: "BUILD",
      payload: { type: "BUILD_STRUCTURE", structureType: "MANUFACTORY", x: 10, y: 2 } })]);
  });

  it("places an unchecked option below resource Place buttons and reads its value on click", () => {
    const host = document.createElement("div");
    host.innerHTML = buildPlaceHtml({ buildings: view.buildings, selection: "build_mine", targetKey: "1,2", placeLabel: "Place" });
    const button = host.querySelector("button")!;
    const checkbox = host.querySelector("input")!;
    expect(button.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resourceBuildChecked(button)).toBe(false);
    checkbox.checked = true;
    expect(resourceBuildChecked(button)).toBe(true);
    const same = host.innerHTML;
    preserveResourceBuildChoice(host, () => { host.innerHTML = same; });
    expect(resourceBuildChecked(host.querySelector("button")!)).toBe(true);
    preserveResourceBuildChoice(host, () => { host.innerHTML = same.replace('data-target-key="1,2"', 'data-target-key="2,2"'); });
    expect(resourceBuildChecked(host.querySelector("button")!)).toBe(false);
    expect(buildPlaceHtml({ buildings: [{ id: "build_manufactory", label: "Manufactory" }], selection: "build_manufactory", targetKey: "1,2", placeLabel: "Place" })).not.toContain("checkbox");
  });
});
