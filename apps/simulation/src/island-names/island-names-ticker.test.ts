import type { DomainPlayer } from "@border-empires/game-domain";
import type { IslandNamesPayload } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { ISLAND_NAMES_TICK_MIN_INTERVAL_MS, createIslandNamesTicker } from "./island-names-ticker.js";
import { garrison, makePlayer, tilesFromRows } from "./island-names.test-helpers.js";

const setup = () => {
  const tiles = tilesFromRows(["LLLLL", "LLLLL"], 20, 20);
  garrison(tiles, "p1");
  const namer = makePlayer("p1", { islandNames: [{ islandId: "20,20", name: "Isle of Waypoint", namedAt: 1 }] });
  const watcher = makePlayer("p2");
  const offline = makePlayer("p3");
  const ai = makePlayer("ai-1", { isAi: true });
  const players = new Map<string, DomainPlayer>([namer, watcher, offline, ai].map((player) => [player.id, player]));
  const sent: Array<{ playerId: string; payload: IslandNamesPayload }> = [];
  const ticker = createIslandNamesTicker({
    tiles: () => tiles,
    players: () => players,
    isPlayerSubscribed: (playerId) => playerId !== "p3",
    emitPlayerMessage: (command, payload) => { sent.push({ playerId: command.playerId, payload }); }
  });
  return { tiles, sent, ticker };
};

describe("createIslandNamesTicker", () => {
  it("sends the current list on connect", () => {
    const { sent, ticker } = setup();
    ticker.sendTo("p1", 0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload.islands.find((island) => island.id === "20,20")).toMatchObject({ name: "Isle of Waypoint", status: "held" });
  });

  it("sends each online human their list once, then only when what they may see changes, throttled", () => {
    const { tiles, sent, ticker } = setup();
    ticker.tick(0); // first run: everyone online gets a list (nothing swallowed into a baseline)
    expect(sent.map((entry) => entry.playerId).sort()).toEqual(["p1", "p2"]);
    sent.length = 0;
    ticker.tick(ISLAND_NAMES_TICK_MIN_INTERVAL_MS); // unchanged
    expect(sent).toHaveLength(0);

    garrison(tiles, "p2", (tile) => tile.x === 20);
    ticker.tick(ISLAND_NAMES_TICK_MIN_INTERVAL_MS + 10); // throttled
    expect(sent).toHaveLength(0);
    ticker.tick(2 * ISLAND_NAMES_TICK_MIN_INTERVAL_MS);
    // p2 now holds land there, so both see the contested name.
    expect(sent.map((entry) => entry.playerId).sort()).toEqual(["p1", "p2"]);
    expect(sent.every((entry) => entry.payload.islands.find((island) => island.id === "20,20")?.status === "contested")).toBe(true);
  });

  it("never tells an outsider who named an island or that it is contested", () => {
    const { sent, ticker } = setup();
    ticker.tick(0);
    const p2View = sent.find((entry) => entry.playerId === "p2")!.payload.islands.find((island) => island.id === "20,20")!;
    expect(p2View.status).toBe("default");
    expect(p2View.namerId).toBeUndefined();
    expect(p2View.name).not.toBe("Isle of Waypoint");
  });
});
