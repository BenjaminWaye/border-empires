// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { queueDevelopmentAction } from "../client-development-queue/client-development-queue.js";
import { handleGenericBuildAction } from "../client-generic-build-action.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { buildPlaceHtml } from "./client-hud-v2-build-list.js";
import { autoImproveOptionForTile, installAutoImproveOptionBinding } from "./client-resource-improvement-action.js";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import { NEW_PLAYER_AUTO_SETTLE_PREFS, NO_AUTO_IMPROVE } from "@border-empires/shared";

type ClientQueueEntry = ReturnType<typeof createInitialState>["developmentQueue"][number];

const view: TileMenuView = { title: "", subtitle: "", tabs: [], overviewLines: [], actions: [], buildings: [{ id: "build_mine", label: "Mine" }], crystal: [] };
const tile = (x: number, extra: Partial<Tile> = {}): Tile => ({ x, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "TITANIUM", ...extra });

describe("resource Place auto-improve toggle", () => {
  it("paces single support builds through the development queue", () => {
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

  it("shows the tile's auto-improve switch under a resource improvement's Place button, and nowhere else", () => {
    const state = createInitialState();
    expect(autoImproveOptionForTile(state.autoSettle, tile(1))).toBeUndefined(); // prefs not loaded yet
    state.autoSettle = loadedAutoSettleState({ ...NEW_PLAYER_AUTO_SETTLE_PREFS, answered: true, improve: { ...NO_AUTO_IMPROVE, TITANIUM: true } });
    const option = autoImproveOptionForTile(state.autoSettle, tile(1));
    expect(option).toEqual({ resource: "TITANIUM", checked: true, label: "Build this on every garrisoned titanium tile automatically" });
    expect(autoImproveOptionForTile(state.autoSettle, tile(1, { resource: "FISH" }))).toBeUndefined();
    const host = document.createElement("div");
    host.innerHTML = buildPlaceHtml({ buildings: view.buildings, selection: "build_mine", targetKey: "1,2", placeLabel: "Place", autoImprove: option });
    const button = host.querySelector("button")!;
    const checkbox = host.querySelector<HTMLInputElement>("input[data-auto-improve]")!;
    expect(button.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(checkbox.checked).toBe(true);
    expect(buildPlaceHtml({ buildings: [{ id: "build_manufactory", label: "Manufactory" }], selection: "build_manufactory", targetKey: "1,2", placeLabel: "Place", autoImprove: option })).not.toContain("checkbox");
  });

  it("toggling sends the garrison switches unchanged plus the new auto-improve switches, and keeps the choice", () => {
    (document as { __autoImproveOptionBound?: boolean }).__autoImproveOptionBound = false;
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ ...NEW_PLAYER_AUTO_SETTLE_PREFS, answered: true, towns: true });
    const send = vi.fn(() => true);
    installAutoImproveOptionBinding(state, send);
    document.body.innerHTML = buildPlaceHtml({ buildings: view.buildings, selection: "build_mine", targetKey: "1,2", placeLabel: "Place", autoImprove: autoImproveOptionForTile(state.autoSettle, tile(1)) });
    document.querySelector<HTMLInputElement>("[data-auto-improve]")!.click();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_AUTO_SETTLE_PREFS", towns: true, TITANIUM: false, improve: { ...NO_AUTO_IMPROVE, TITANIUM: true } }));
    expect(state.autoSettle.status === "loaded" && state.autoSettle.prefs.improve.TITANIUM).toBe(true);
  });
});
