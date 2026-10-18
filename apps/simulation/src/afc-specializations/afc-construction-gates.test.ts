import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { hasFreeResourceSlots } from "../runtime-structure-slot-gate.js";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";

const target: DomainTileState = { x: 1, y: 0, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" };
const command: CommandEnvelope = { commandId: "build", sessionId: "test", playerId: "p", clientSeq: 1, issuedAt: 100, type: "BUILD_FORT", payloadJson: "{}" };
const context = (ids: string[], count = 0, tiles = new Map<string, DomainTileState>()) => ({
  players: new Map([["p", { ...createHumanRuntimePlayer("p"), domainIds: new Set(ids) }]]), tiles,
  ownedStructureCountForPlayer: () => count,
  resourceSlotSupplyForPlayer: () => ({ FOOD: 10, TITANIUM: 0, UMBRITE: 0, CRYSTAL: 0 }),
  resourceSlotDemandForPlayer: () => ({ FOOD: 0, TITANIUM: 0, UMBRITE: 0, CRYSTAL: 0 }), emitEvent: vi.fn()
});
describe("AFC waivers apply before construction is rejected", () => {
  it("allows the first tower at zero free CRYSTAL, but refuses the second", () => {
    expect(hasFreeResourceSlots(context(["afc-oracle-1"]), command, "OBSERVATORY", "OBSERVATORY", target, "observatory")).toBe(true);
    expect(hasFreeResourceSlots(context(["afc-oracle-1"], 1), command, "OBSERVATORY", "OBSERVATORY", target, "observatory")).toBe(false);
  });
  it("waives Titanium for the first three forts without waiving other requirements", () => {
    expect(hasFreeResourceSlots(context(["afc-bastion-1"], 2), command, "FORT", "FORT", target, "fort")).toBe(true);
    expect(hasFreeResourceSlots(context(["afc-bastion-1"], 3), command, "FORT", "FORT", target, "fort")).toBe(false);
  });
  it("keeps an early fort's waiver when upgrading it after a fourth fort exists", () => {
    const forts = [1, 2, 3, 4].map(x => ({ ...target, x, fort: { ownerId: "p", status: "active" as const, variant: "FORT" as const, activatedAt: x } }));
    const ctx = context(["afc-bastion-1"], 4, new Map(forts.map(tile => [`${tile.x},0`, tile])));
    expect(hasFreeResourceSlots(ctx, command, "FORT", "TITANIUM_BASTION", forts[0]!, "fort")).toBe(true);
    expect(hasFreeResourceSlots(ctx, command, "FORT", "TITANIUM_BASTION", forts[3]!, "fort")).toBe(false);
  });
});
