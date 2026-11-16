import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { RuntimePlayer } from "../runtime-types.js";
import { buildResourceSlotSupply } from "./resource-slot-supply-build.js";

const player = (overrides: Partial<RuntimePlayer> = {}): RuntimePlayer =>
  ({ id: "p1", isAi: false, points: 0, manpower: 0, techIds: new Set(), domainIds: new Set(), allies: new Set(), ...overrides }) as RuntimePlayer;

const tile = (x: number, resource: DomainTileState["resource"]): DomainTileState => ({
  x, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", resource
}) as DomainTileState;
// A town at (3,1) with a working Titanium Refinery on its ring at (4,1),
// processing the titanium field at (0,0)-(1,0).
const town = { x: 3, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } } as DomainTileState;
const refinery = { x: 4, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED",
  economicStructure: { ownerId: "p1", type: "TITANIUM_REFINERY", status: "active", refineryField: { x: 0, y: 0, assignedAt: 1 } } } as DomainTileState;

const build = (p: RuntimePlayer, tiles: DomainTileState[], hasFoundryHeart = false) =>
  buildResourceSlotSupply({
    players: new Map([[p.id, p]]),
    tiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t])),
    settledTilesForPlayer: (id) => (id === p.id ? tiles : []),
    activeObservatoryKeysForPlayer: () => [],
    hasFoundryHeart: () => hasFoundryHeart,
    summaryForPlayer: () => createEmptyPlayerRuntimeSummary()
  }, p.id);

describe("buildResourceSlotSupply", () => {
  it("labels every slot by source, and the rows add up to the totals", () => {
    const p = player({ afcScarcityFoodSlots: 1, waystationResourceSlotBonus: { UMBRITE: 2 } });
    const { totals, sources } = build(p, [tile(0, "TITANIUM"), tile(1, "TITANIUM"), tile(2, "FISH"), town, refinery], true);

    expect(sources.TITANIUM).toEqual(expect.arrayContaining([
      { kind: "TILE", id: "TITANIUM", slots: 2, count: 2 },
      { kind: "STRUCTURE_BOOST", id: "TITANIUM_REFINERY", slots: 4, count: 2 },
      { kind: "FOUNDRY_HEART", id: "", slots: 1, count: 1 }
    ]));
    expect(sources.FOOD).toEqual(expect.arrayContaining([
      { kind: "TILE", id: "FISH", slots: 2, count: 1 },
      { kind: "UPGRADE", id: "afc-exchequer-2", slots: 1, count: 1 }
    ]));
    expect(sources.UMBRITE).toEqual(expect.arrayContaining([{ kind: "WAYSTATION", id: "", slots: 2, count: 1 }]));
    for (const resource of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
      expect(sources[resource].reduce((sum, row) => sum + row.slots, 0)).toBe(totals[resource]);
    }
    expect(totals).toEqual({ FOOD: 4, TITANIUM: 7, CRYSTAL: 1, UMBRITE: 3 });
  });
});
