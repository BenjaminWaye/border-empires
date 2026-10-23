import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import type { RuntimeMapCommandContext } from "../runtime-map-command-handlers.js";
import { garrison, makePlayer, tilesFromRows } from "./island-names.test-helpers.js";
import { handleNameIslandCommand } from "./name-island-command-handler.js";

const createContext = (tiles: Map<string, DomainTileState>, players: DomainPlayer[]) => {
  const events: SimulationEvent[] = [];
  const messages: Array<Record<string, unknown>> = [];
  const context = {
    players: new Map(players.map((player) => [player.id, player])),
    tiles,
    now: () => 5_000,
    emitEvent: (event: SimulationEvent) => { events.push(event); },
    emitPlayerMessage: (_command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => { messages.push(payload); }
  } as Pick<RuntimeMapCommandContext, "players" | "tiles" | "now" | "emitEvent" | "emitPlayerMessage"> as RuntimeMapCommandContext;
  return { context, events, messages };
};

const command = (playerId: string, payload: Record<string, unknown>): CommandEnvelope => ({
  commandId: `cmd-${playerId}`,
  sessionId: "s",
  playerId,
  clientSeq: 1,
  issuedAt: 0,
  type: "NAME_ISLAND",
  payloadJson: JSON.stringify(payload)
});

const rejection = (events: SimulationEvent[]) => events.find((event) => event.eventType === "COMMAND_REJECTED");

// Each test builds a fresh tile map: the island registry is cached per map.
const freshIsland = () => tilesFromRows(["LLLLL", "LLLLL", "....."], 10, 10);

describe("handleNameIslandCommand", () => {
  it("names an island its player fully garrisons", () => {
    const tiles = freshIsland();
    garrison(tiles, "p1");
    const player = makePlayer("p1");
    const { context, events, messages } = createContext(tiles, [player]);
    handleNameIslandCommand(context, command("p1", { x: 12, y: 11, name: "  Isle   of Waypoint " }));
    expect(rejection(events)).toBeUndefined();
    expect(player.islandNames).toEqual([{ islandId: "10,10", name: "Isle of Waypoint", namedAt: 5_000 }]);
    const islands = messages[0]?.islands as Array<{ id: string; name: string; status: string }>;
    expect(islands.find((island) => island.id === "10,10")).toMatchObject({ name: "Isle of Waypoint", status: "held" });
  });

  it("refuses while any LAND tile of the island is not the player's garrison", () => {
    const tiles = freshIsland();
    garrison(tiles, "p1", (tile) => !(tile.x === 14 && tile.y === 11));
    const player = makePlayer("p1");
    const { context, events } = createContext(tiles, [player]);
    handleNameIslandCommand(context, command("p1", { x: 12, y: 11, name: "Isle of Waypoint" }));
    expect(rejection(events)).toMatchObject({ code: "ISLAND_NOT_HELD" });
    expect(player.islandNames).toBeUndefined();
  });

  it("rejects sea tiles, bad names and profanity", () => {
    const tiles = freshIsland();
    garrison(tiles, "p1");
    const { context, events } = createContext(tiles, [makePlayer("p1")]);
    handleNameIslandCommand(context, command("p1", { x: 12, y: 12, name: "Isle of Waypoint" }));
    expect(rejection(events)).toMatchObject({ code: "ISLAND_NOT_FOUND" });
    events.length = 0;
    handleNameIslandCommand(context, command("p1", { x: 12, y: 11, name: "ab" }));
    expect(rejection(events)).toMatchObject({ code: "ISLAND_NAME_INVALID" });
    events.length = 0;
    handleNameIslandCommand(context, command("p1", { x: 12, y: 11, name: "Sh1t Isle" }));
    expect(rejection(events)).toMatchObject({ code: "ISLAND_NAME_INVALID" });
  });

  it("replaces a rival's earlier name once the player holds the whole island", () => {
    const tiles = freshIsland();
    garrison(tiles, "p2");
    const previous = makePlayer("p1", { islandNames: [{ islandId: "10,10", name: "Old Name", namedAt: 1 }] });
    const conqueror = makePlayer("p2");
    const { context, events } = createContext(tiles, [previous, conqueror]);
    handleNameIslandCommand(context, command("p2", { x: 10, y: 10, name: "Cogsworth" }));
    expect(rejection(events)).toBeUndefined();
    expect(previous.islandNames).toBeUndefined();
    expect(conqueror.islandNames?.map((claim) => claim.name)).toEqual(["Cogsworth"]);
  });
});
