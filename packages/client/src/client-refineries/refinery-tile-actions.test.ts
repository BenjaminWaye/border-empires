import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "../client-tile-action-logic/client-tile-action-logic.js";
import { structureTypeForTileAction, requiredTechForTileAction } from "../client-tile-action-support/client-build-action-dispatch.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { REFINERY_FIXTURE_ME, placeRefineryFixture, refineryFixtureGrid } from "./refinery-fixtures.js";
import { refineryTileActions, type RefineryActionDeps } from "./refinery-tile-actions.js";

const stateWith = (tiles = refineryFixtureGrid(), techIds = ["mining", "leatherworking", "industrial-extraction"]) => {
  const state = createInitialState();
  state.me = REFINERY_FIXTURE_ME;
  state.tiles = tiles;
  state.techIds = techIds;
  state.techCatalog = [{ id: "mining", name: "Deep Survey" }, { id: "industrial-extraction", name: "Industrial Extraction" }] as typeof state.techCatalog;
  state.resourceSlots = { supply: { FOOD: 10, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } } as typeof state.resourceSlots;
  return state;
};

const deps = (town?: Tile, blocked = false, has: (type: string) => boolean = () => false): RefineryActionDeps => ({
  structureCostText: () => "80 manpower",
  availability: (_type, eligible, reason, cost) => [eligible, reason, cost],
  townBuildSource: town,
  supportPlacementBlocked: blocked,
  townHasSupportStructure: (_town, type) => has(type)
});

const byId = (actions: TileActionDef[], id: string): TileActionDef | undefined => actions.find((action) => action.id === id);

describe("refinery tile actions", () => {
  it("offers Refine at… on your deposit with a town in reach, with the slot gain", () => {
    const state = stateWith();
    const deposit = state.tiles.get("106,100")!;
    const row = byId(refineryTileActions(state, deposit, deps()), "refine_at_town")!;
    expect(row.disabled).toBe(false);
    expect(row.label).toBe("Refine at…");
    expect(row.cost).toContain("+6 slots now");
  });

  it("greys Refine at… with the reason: tech, unlinked field, no town in reach, no free FOOD slot", () => {
    expect(byId(refineryTileActions(stateWith(undefined, []), stateWith().tiles.get("106,100")!, deps()), "refine_at_town")).toMatchObject({ disabled: true, disabledReason: "Requires Deep Survey" });
    const state = stateWith();
    expect(byId(refineryTileActions(state, state.tiles.get("110,100")!, deps()), "refine_at_town")).toBeUndefined(); // not your tile
    state.tiles.get("110,100")!.ownerId = REFINERY_FIXTURE_ME;
    state.tiles.get("110,100")!.ownershipState = "FRONTIER";
    expect(byId(refineryTileActions(state, state.tiles.get("110,100")!, deps()), "refine_at_town")?.disabledReason).toMatch(/Not linked/);
    state.tiles.set("140,100", { x: 140, y: 100, terrain: "LAND", resource: "GEMS", ownerId: REFINERY_FIXTURE_ME, ownershipState: "SETTLED" });
    expect(byId(refineryTileActions(state, state.tiles.get("140,100")!, deps()), "refine_at_town")?.disabledReason).toBe("No town of yours within 10 land tiles of this field");
    state.resourceSlots.demand.FOOD = 10;
    expect(byId(refineryTileActions(state, state.tiles.get("106,100")!, deps()), "refine_at_town")?.disabledReason).toBe("Need a free FOOD slot");
  });

  it("shows no Refine at… on tiles that are not strategic deposits", () => {
    const state = stateWith();
    expect(byId(refineryTileActions(state, state.tiles.get("101,101")!, deps()), "refine_at_town")).toBeUndefined();
  });

  it("lists the refinery and booster builds on a support tile, greying a refinery with no free linked field", () => {
    const state = stateWith();
    const rows = refineryTileActions(state, state.tiles.get("101,101")!, deps(state.tiles.get("100,100")));
    expect(rows.map((row) => row.id)).toEqual(["build_titanium_refinery", "build_umbrite_refinery", "build_crystal_refinery", "build_titanium_smelter", "build_umbrite_distillery", "build_crystal_cutter"]);
    expect(byId(rows, "build_titanium_refinery")).toMatchObject({ disabled: false });
    expect(byId(rows, "build_titanium_refinery")!.cost).toContain("best field +6 slots");
    expect(byId(rows, "build_umbrite_refinery")).toMatchObject({ disabled: true, disabledReason: "No Umbrite field within 10 land tiles of this town" });
    expect(byId(rows, "build_crystal_refinery")).toMatchObject({ disabled: false });
    expect(byId(rows, "build_titanium_smelter")).toMatchObject({ disabled: false });
  });

  it("greys a refinery whose only field is taken, and a second booster in the same town", () => {
    const state = stateWith();
    placeRefineryFixture(state.tiles, 99, 99, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    const rows = refineryTileActions(state, state.tiles.get("101,101")!, deps(state.tiles.get("100,100"), false, (type) => type === "TITANIUM_SMELTER"));
    expect(byId(rows, "build_titanium_refinery")!.disabledReason).toMatch(/^No free Titanium field linked: Processed by your refinery at \(99, 99\)/);
    expect(byId(rows, "build_titanium_smelter")).toMatchObject({ disabled: true, disabledReason: "This town already has a Titanium Smelter" });
  });

  it("offers Change field on your refinery, and Choose field when it has none", () => {
    const state = stateWith();
    const refinery = placeRefineryFixture(state.tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    expect(byId(refineryTileActions(state, refinery, deps()), "change_refinery_field")).toMatchObject({ label: "Change field", disabled: false });
    delete refinery.economicStructure!.refineryField;
    state.tilesRevision += 1;
    expect(byId(refineryTileActions(state, refinery, deps()), "change_refinery_field")?.label).toBe("Choose field");
  });

  it("maps every build row to its structure and tech, so the button sends a build", () => {
    expect(structureTypeForTileAction("build_crystal_refinery")).toBe("CRYSTAL_REFINERY");
    expect(structureTypeForTileAction("build_umbrite_distillery")).toBe("UMBRITE_DISTILLERY");
    expect(requiredTechForTileAction("build_umbrite_refinery")).toBe("leatherworking");
    expect(requiredTechForTileAction("build_crystal_cutter")).toBe("industrial-extraction");
  });

  it("reaches the real tile menu on a deposit and on a town", () => {
    const state = stateWith();
    const menuDeps = {
      keyFor: (x: number, y: number) => `${x},${y}`, wrapX: (x: number) => x, wrapY: (y: number) => y, terrainAt: () => "LAND" as const,
      buildDetailTextForAction: () => undefined, structureCostText: () => "80 manpower", structureGoldCost: () => 0,
      supportedOwnedTownsForTile: () => [], supportedOwnedDocksForTile: () => [], townHasSupportStructure: () => false,
      developmentSlotSummary: () => ({ busy: 0, limit: 3, available: 3 }), developmentSlotReason: () => "", abilityCooldownRemainingMs: () => 0,
      formatCooldownShort: () => "", isTileOwnedByAlly: () => false, hostileObservatoryProtectingTile: () => undefined,
      activeTruceWithPlayer: () => undefined, pendingTruceWithPlayer: () => undefined, ownerSpawnShieldActive: () => false, connectedOwnedFrontierKeysFor: () => []
    };
    expect(byId(menuActionsForSingleTile(state, state.tiles.get("106,100")!, menuDeps as never), "refine_at_town")?.disabled).toBe(false);
    expect(byId(menuActionsForSingleTile(state, state.tiles.get("100,100")!, menuDeps as never), "build_titanium_refinery")?.disabled).toBe(false);
  });
});
