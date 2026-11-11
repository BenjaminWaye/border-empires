import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { StructureTierOption, Tile } from "../client-types.js";
import { fortTierOptionsForTile, siegeTierOptionsForTile, tierRowAvailability } from "./client-structure-tier-options.js";

const AFC_KEY = "8,8";
const tileAt = (overrides: Partial<Tile> = {}): Tile => ({ x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...overrides } as Tile);

const playerState = (techIds: string[], installed: string[] = techIds) => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  state.techIds = techIds;
  state.techCatalog = [
    { id: "masonry", name: "Titanium Forge Module" },
    { id: "fortified-walls", name: "Fortified Walls" },
    { id: "steelworking", name: "Steelworking" },
    { id: "leatherworking", name: "Umbrite Rigging Module" },
    { id: "siegecraft", name: "Siegecraft" }
  ] as never;
  Object.assign(state.resourceSlots.supply, { FOOD: 9, TITANIUM: 9, UMBRITE: 9 });
  state.tiles.set(AFC_KEY, tileAt({ x: 8, y: 8, afc: { ownerId: "me", status: "active", modules: installed } }));
  return state;
};

const summary = (options: StructureTierOption[]) => options.map((entry) => [entry.label, entry.disabled ? entry.disabledReason : "ok"]);

describe("fortTierOptionsForTile", () => {
  it("offers every tier on bare ground, each lock explained instead of hidden", () => {
    const state = playerState(["masonry", "fortified-walls"]);
    expect(summary(fortTierOptionsForTile(state, tileAt()))).toEqual([
      ["Palisade", "ok"],
      ["Fort", "ok"],
      ["Titanium Bastion", "ok"],
      ["Thunder Bastion", "Requires Steelworking"]
    ]);
  });

  it("lets a player pick a cheaper tier than their best", () => {
    const state = playerState(["masonry", "fortified-walls", "steelworking"]);
    const fort = fortTierOptionsForTile(state, tileAt()).find((entry) => entry.label === "Fort");
    expect(fort).toMatchObject({ structureType: "FORT", tier: "FORT", disabled: false });
  });

  it("explains a researched-but-uninstalled Titanium Forge Module (the waystation case) and keeps Palisade buildable", () => {
    const state = playerState(["masonry"], []);
    expect(summary(fortTierOptionsForTile(state, tileAt()))).toEqual([
      ["Palisade", "ok"],
      ["Fort", "Install Titanium Forge Module on an active AFC"],
      ["Titanium Bastion", "Requires Fortified Walls"],
      ["Thunder Bastion", "Requires Steelworking"]
    ]);
  });

  it("points a player without the module at it", () => {
    const fort = fortTierOptionsForTile(playerState([]), tileAt()).find((entry) => entry.label === "Fort");
    expect(fort).toMatchObject({ disabled: true, disabledReason: "Requires Titanium Forge Module", techLinkId: "masonry" });
  });

  it("only offers tiers above a standing fort (skipping allowed), and drops Palisade once fortified", () => {
    const state = playerState(["masonry", "fortified-walls", "steelworking"]);
    expect(fortTierOptionsForTile(state, tileAt({ fort: { ownerId: "me", status: "active", variant: "FORT" } })).map((entry) => entry.label))
      .toEqual(["Titanium Bastion", "Thunder Bastion"]);
    expect(fortTierOptionsForTile(state, tileAt({ fort: { ownerId: "me", status: "active", variant: "PALISADE" } })).map((entry) => entry.label))
      .toEqual(["Fort", "Titanium Bastion", "Thunder Bastion"]);
    expect(fortTierOptionsForTile(state, tileAt({ fort: { ownerId: "me", status: "active", variant: "THUNDER_BASTION" } }))).toEqual([]);
  });

  it("reports a slot shortfall for one tier without blocking the others", () => {
    const state = playerState(["masonry", "fortified-walls"]);
    state.resourceSlots.supply.TITANIUM = 1;
    expect(summary(fortTierOptionsForTile(state, tileAt())).slice(1, 3)).toEqual([
      ["Fort", "ok"],
      ["Titanium Bastion", "Need 2 free TITANIUM slots (have 1)"]
    ]);
  });

  it("adds the garrison step to the cost on a FRONTIER tile", () => {
    const state = playerState(["masonry"]);
    const [palisade] = fortTierOptionsForTile(state, tileAt({ ownershipState: "FRONTIER" }));
    expect(palisade?.cost).toContain("+ garrison");
  });
});

describe("siegeTierOptionsForTile", () => {
  it("offers every siege tier with its own lock", () => {
    const state = playerState(["leatherworking", "siegecraft"]);
    expect(summary(siegeTierOptionsForTile(state, tileAt(), false))).toEqual([
      ["Siege Battery", "ok"],
      ["Siege Tower", "ok"],
      ["Dread Tower", "Requires standing-army"]
    ]);
  });

  it("blocks every tier outside reach", () => {
    const state = playerState(["leatherworking"]);
    expect(siegeTierOptionsForTile(state, tileAt({ ownershipState: "FRONTIER" }), true)[0]).toMatchObject({ disabled: true, disabledReason: "Outside your reach" });
  });
});

describe("tierRowAvailability", () => {
  it("is enabled while any tier is", () => {
    expect(tierRowAvailability([{ disabled: true, disabledReason: "x" } as StructureTierOption, { disabled: false } as StructureTierOption])).toEqual({ disabled: false });
  });

  it("prefers a non-tech reason so the menu doesn't hide the row as tech-locked", () => {
    const options = [
      { disabled: true, disabledReason: "Need a free FOOD slot" },
      { disabled: true, disabledReason: "Requires Titanium Forge Module" }
    ] as StructureTierOption[];
    expect(tierRowAvailability(options)).toEqual({ disabled: true, disabledReason: "Need a free FOOD slot" });
  });
});
