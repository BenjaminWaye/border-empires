import { describe, expect, it } from "vitest";
import { splitTileActionsIntoTabs } from "./client-tile-action-support.js";
import type { TileActionDef } from "./client-types.js";

const state = { techIds: ["navigation", "trade", "coinage", "industrial-extraction"] };

describe("splitTileActionsIntoTabs", () => {
  it("keeps crystal-only menu content visible", () => {
    const crystalOnly: TileActionDef[] = [
      {
        id: "aether_bridge",
        label: "Aether Bridge",
        cost: "30 CRYSTAL • crosses up to 4 sea tiles",
        disabled: false
      }
    ];

    expect(splitTileActionsIntoTabs(crystalOnly, state)).toEqual({
      actions: [],
      buildings: [],
      crystal: crystalOnly
    });
  });

  it("hides disabled-only non-crystal action tabs while keeping overview fallback possible", () => {
    const disabledActions: TileActionDef[] = [
      {
        id: "launch_attack",
        label: "Launch Attack",
        disabled: true,
        disabledReason: "No bordering origin tile or linked dock",
        cost: "No bordering origin tile or linked dock"
      }
    ];

    expect(splitTileActionsIntoTabs(disabledActions, state)).toEqual({
      actions: [],
      buildings: [],
      crystal: []
    });
  });

  it("keeps a disabled-only Buildings tab visible", () => {
    const disabledBuildings: TileActionDef[] = [
      {
        id: "build_foundry",
        label: "Build Foundry",
        disabled: true,
        disabledReason: "Need 4500 gold",
        cost: "Need 4500 gold"
      }
    ];

    expect(splitTileActionsIntoTabs(disabledBuildings, state)).toEqual({
      actions: [],
      buildings: disabledBuildings,
      crystal: []
    });
  });

  it("sorts support-only buildings before general settled buildings", () => {
    const rows: TileActionDef[] = [
      {
        id: "build_foundry",
        label: "Build Foundry",
        disabled: false
      },
      {
        id: "build_market",
        label: "Build Market",
        disabled: false
      },
      {
        id: "build_bank",
        label: "Build Bank",
        disabled: false
      }
    ];

    expect(splitTileActionsIntoTabs(rows, state).buildings.map((row) => row.id)).toEqual([
      "build_market",
      "build_bank",
      "build_foundry"
    ]);
  });
});
