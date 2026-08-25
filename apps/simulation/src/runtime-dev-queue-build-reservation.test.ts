import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { devQueueBuildReservationContext, reservedSlotDemandForQueue } from "./runtime-dev-queue-build-reservation.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";

const PLAYER_ID = "player-1";

function makePlayer(overrides: Partial<DomainPlayer> = {}): DomainPlayer {
  return { id: PLAYER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set(), ...overrides };
}

function makeTile(overrides: Partial<DomainTileState> = {}): DomainTileState {
  return { x: 5, y: 5, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED", ...overrides };
}

function makeContext(player: DomainPlayer, tile: DomainTileState, supply: Partial<Record<string, number>> = {}) {
  const players = new Map([[PLAYER_ID, player]]);
  const tiles = new Map([[`${tile.x},${tile.y}`, tile]]);
  const zero = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const context = {
    players,
    tiles,
    playerManpowerCap: () => 10_000,
    ownedStructureCountForPlayer: () => 0,
    hasNearbyQuartermastersOffice: () => false,
    resourceSlotSupplyForPlayer: () => ({ ...zero, ...supply }),
    resourceSlotDemandForPlayer: () => ({ ...zero })
  } as unknown as RuntimeStructureCommandContext;
  return context;
}

describe("estimateDevQueueBuildReservation (via devQueueBuildReservationContext)", () => {
  it("reserves the flat manpower cost for a plain economic structure with no queued competition for its slot", () => {
    const context = makeContext(makePlayer({ manpower: 1000 }), makeTile(), { CRYSTAL: 1 });
    const { estimateBuildReservation } = devQueueBuildReservationContext(context);
    const result = estimateBuildReservation(PLAYER_ID, "OBSERVATORY", 5, 5, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(result).toEqual({ ok: true, manpowerCost: expect.any(Number), slotRequirements: [{ resource: "CRYSTAL", count: 1 }] });
  });

  it("rejects when the player can't afford the manpower cost", () => {
    const context = makeContext(makePlayer({ manpower: 0 }), makeTile(), { CRYSTAL: 1 });
    const { estimateBuildReservation } = devQueueBuildReservationContext(context);
    const result = estimateBuildReservation(PLAYER_ID, "OBSERVATORY", 5, 5, { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "INSUFFICIENT_MANPOWER" });
  });

  it("rejects when another already-queued entry has claimed the only free slot", () => {
    const context = makeContext(makePlayer({ manpower: 1000 }), makeTile(), { CRYSTAL: 1 });
    const { estimateBuildReservation } = devQueueBuildReservationContext(context);
    const result = estimateBuildReservation(PLAYER_ID, "OBSERVATORY", 5, 5, { FOOD: 0, TITANIUM: 0, CRYSTAL: 1, UMBRITE: 0 });
    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_SLOT" });
  });

  it("applyManpowerReservation deducts and refundManpowerReservation restores, capped at the manpower cap", () => {
    const player = makePlayer({ manpower: 100 });
    const context = makeContext(player, makeTile());
    const { applyManpowerReservation, refundManpowerReservation } = devQueueBuildReservationContext(context);
    applyManpowerReservation(PLAYER_ID, 40);
    expect(player.manpower).toBe(60);
    refundManpowerReservation(PLAYER_ID, 40);
    expect(player.manpower).toBe(100);
    refundManpowerReservation(PLAYER_ID, 50_000);
    expect(player.manpower).toBe(10_000);
  });
});

describe("reservedSlotDemandForQueue", () => {
  it("sums reservedSlotRequirements across queue entries", () => {
    const totals = reservedSlotDemandForQueue([
      { reservedSlotRequirements: [{ resource: "TITANIUM", count: 1 }] },
      { reservedSlotRequirements: [{ resource: "TITANIUM", count: 2 }, { resource: "CRYSTAL", count: 1 }] },
      {}
    ]);
    expect(totals).toEqual({ FOOD: 0, TITANIUM: 3, CRYSTAL: 1, UMBRITE: 0 });
  });
});
