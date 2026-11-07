// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { handleGenericBuildAction } from "../client-generic-build-action.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { buildPlaceHtml } from "./client-hud-v2-build-list.js";
import { preserveResourceBuildChoice, resourceBuildChecked } from "./client-resource-improvement-action.js";

const view: TileMenuView = { title: "", subtitle: "", tabs: [], overviewLines: [], actions: [], buildings: [{ id: "build_mine", label: "Mine" }], crystal: [] };
const tile = (x: number, extra: Partial<Tile> = {}): Tile => ({ x, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "TITANIUM", ...extra });

describe("resource Place checkbox", () => {
  it("sends the same improvement to eligible garrisoned deposits only", () => {
    const state = createInitialState();
    state.me = "me";
    const tiles = [tile(1), tile(2), tile(3, { resource: "CRYSTAL" }), tile(4, { ownerId: "rival" }), tile(5, { ownershipState: "FRONTIER" }), tile(6, { optimisticPending: "settle" }), tile(7)];
    for (const t of tiles) state.tiles.set(`${t.x},2`, t);
    const handleBuildAction = vi.fn();
    const run = (checked: boolean) => handleGenericBuildAction({
      state, actionId: "build_mine", selected: tiles[0]!, buildAllResources: checked,
      viewForTile: (t) => t.x === 7 ? { ...view, buildings: [{ id: "build_mine", label: "Mine", disabled: true }] } : view,
      handleBuildAction, pushFeed: vi.fn(), hideMenu: vi.fn()
    });
    run(false);
    expect(handleBuildAction.mock.calls.map((c) => c[2].x)).toEqual([1]);
    handleBuildAction.mockClear();
    run(true);
    expect(handleBuildAction.mock.calls.map((c) => c[2].x)).toEqual([1, 2]);
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
