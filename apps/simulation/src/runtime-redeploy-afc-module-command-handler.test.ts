import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime/runtime.js";

const EIGHT_MODULES = ["leatherworking", "fortified-walls", "siegecraft", "muster-discipline", "steelworking", "muster-command", "cryptography", "logistics"];

const makePlayer = () => ({
  id: "player-1",
  isAi: false,
  points: 10_000,
  manpower: 10_000,
  techIds: new Set<string>(["masonry", ...EIGHT_MODULES]),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const afcTile = (x: number, activatedAt: number, modules: string[]): DomainTileState => ({
  x, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
  afc: { ownerId: "player-1", status: "active", activatedAt, modules, houseModules: modules }
});

describe("REDEPLOY_AFC_MODULE", () => {
  it("rejects a call-down onto an AFC that already holds 8 modules", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: () => {},
      initialPlayers: new Map([["player-1", makePlayer()]]),
      initialState: { tiles: [afcTile(20, 0, ["masonry"]), afcTile(25, 1, EIGHT_MODULES)], activeLocks: [] }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => { events.push(event); });

    runtime.submitCommand({
      commandId: "redeploy-1", sessionId: "s", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "REDEPLOY_AFC_MODULE", payloadJson: JSON.stringify({ techId: "masonry", x: 25, y: 20 })
    });
    await Promise.resolve();

    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "redeploy-1", code: "AFC_FULL" }));
    const home = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
    expect(JSON.parse(home!.afcJson!).houseModules).toEqual(["masonry"]); // never left
  });
});
