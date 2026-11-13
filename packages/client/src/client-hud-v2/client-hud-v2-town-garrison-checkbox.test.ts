import { NEW_PLAYER_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import { townScreenRegions } from "./client-hud-v2-town.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

const town = { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "T", type: "FARMING", populationTier: "TOWN" } } as Tile;
const support = { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;
const view = (actions: TileActionDef[]): TileMenuView =>
  ({ title: "T", subtitle: "", actions, buildings: [], crystal: [], tabs: ["actions"], overviewLines: [] }) as unknown as TileMenuView;
const garrison = { id: "settle_land", label: "Garrison", cost: "0 coin, 20 manpower" } as TileActionDef;
const prefs = (towns: boolean) => loadedAutoSettleState({ ...NEW_PLAYER_AUTO_SETTLE_PREFS, answered: true, towns });
const bar = (autoSettle: ReturnType<typeof prefs> | undefined, focusActions: TileActionDef[], townActions: TileActionDef[] = []): string =>
  townScreenRegions({
    town, focus: support, townView: view(townActions), focusView: view(focusActions),
    townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined, ...(autoSettle ? { autoSettle } : {})
  }).bar;

describe("town screen Garrison auto checkbox", () => {
  it("shows it checked or unchecked from live prefs, not the view snapshot", () => {
    const stale = { ...garrison, autoSettleOption: { category: "towns", checked: false, label: "x" } } as TileActionDef;
    expect(bar(prefs(true), [stale])).toMatch(/data-tile-auto-settle="towns" checked/);
    expect(bar(prefs(false), [stale])).not.toContain("checked");
    expect(bar(prefs(false), [stale])).toContain('data-tile-auto-settle="towns"');
  });

  it("shows it for the town's own Garrison too", () => {
    expect(bar(prefs(true), [], [garrison])).toContain('data-tile-auto-settle="towns"');
  });

  it("omits it when prefs are not loaded or there is no Garrison", () => {
    expect(bar(undefined, [garrison])).not.toContain("data-tile-auto-settle");
    expect(bar(prefs(true), [])).not.toContain("data-tile-auto-settle");
  });
});
