import { describe, expect, it, vi } from "vitest";
import { handleAfcCourtMessage } from "./afc-force-truce-message.js";
import { createSocialState } from "../social-state/social-state.js";
import { SimulationRuntime } from "../../../simulation/src/runtime/runtime.js";
import { buildPlayer } from "../../../simulation/src/runtime/runtime.test-helpers.js";
import { buildPlayerSubscriptionSnapshot } from "../../../simulation/src/player-snapshot/player-snapshot.js";

function setup(installed: boolean) {
  const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, seedTiles: new Map(), initialPlayers: new Map([["p", buildPlayer("p", { domainIds: new Set(installed ? ["afc-chancery-4"] : []) })]]), initialState: { tiles: [{ x: 0, y: 0, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" }], activeLocks: [] } });
  const socialState = createSocialState({ now: () => 1000, players: [{ id: "p", name: "Player" }, { id: "e", name: "Enemy" }] });
  const deps = { socialState, ensureSubscribed: vi.fn(async () => buildPlayerSubscriptionSnapshot("p", runtime.exportState())), syncTruceToSimulation: vi.fn(async () => true), fanoutPlayerPayloads: vi.fn(), sendJson: vi.fn() };
  return deps;
}
describe("Court commands trust the server's upgrades", () => {
  it("rejects guest use before loading or changing diplomacy", async () => {
    const deps = setup(true);
    await handleAfcCourtMessage(deps, { type: "FORCE_TRUCE", targetPlayerId: "e" }, { playerId: "p", isGuest: true }, {});
    expect(deps.ensureSubscribed).not.toHaveBeenCalled(); expect(deps.socialState.activeTrucePairs()).toEqual([]);
    expect(deps.sendJson).toHaveBeenCalledWith({}, expect.objectContaining({ code: "GUEST_DIPLOMACY_LOCKED" }));
  });
  it("rejects the command when the authoritative player has no mandate", async () => {
    const deps = setup(false);
    await handleAfcCourtMessage(deps, { type: "FORCE_TRUCE", targetPlayerId: "e" }, { playerId: "p" }, {});
    expect(deps.socialState.activeTrucePairs()).toEqual([]); expect(deps.syncTruceToSimulation).not.toHaveBeenCalled();
    expect(deps.sendJson).toHaveBeenCalledWith({}, expect.objectContaining({ code: "AFC_UPGRADE_REQUIRED" }));
  });
  it("persists the agreement, synchronizes normal attack enforcement, and then fans out", async () => {
    const deps = setup(true);
    await handleAfcCourtMessage(deps, { type: "FORCE_TRUCE", targetPlayerId: "e" }, { playerId: "p" }, {});
    expect(deps.socialState.activeTrucePairs()).toHaveLength(1);
    expect(deps.syncTruceToSimulation).toHaveBeenCalledWith({ playerId: "p", targetPlayerId: "e", truced: true });
    expect(deps.fanoutPlayerPayloads).toHaveBeenCalledOnce(); expect(deps.sendJson).not.toHaveBeenCalled();
  });
});
