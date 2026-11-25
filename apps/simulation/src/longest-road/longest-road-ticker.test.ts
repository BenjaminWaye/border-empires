import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { computeLongestRoad } from "../season-stats/season-stats.js";
import { computeLiveLongestRoad, createLongestRoadTicker, LONGEST_ROAD_PASS_INTERVAL_MS } from "./longest-road-ticker.js";

const land = (x: number, y: number, ownerId: string, townName?: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED", ...(townName ? { town: { name: townName, type: "MARKET", populationTier: "TOWN" } } : {}) }) as DomainTileState;

const world = (): Map<string, DomainTileState> => {
  const tiles = [land(10, 10, "p1", "Ash"), land(11, 10, "p1"), land(12, 10, "p1"), land(13, 10, "p1", "Brine"), land(20, 20, "p2", "Cove"), land(21, 20, "p2", "Dell")];
  return new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
};
const players = new Map<string, DomainPlayer>([
  ["p1", { id: "p1", name: "Waypoint", isAi: false } as DomainPlayer],
  ["p2", { id: "p2", name: "Rival", isAi: false } as DomainPlayer]
]);
const townTileKeys = (tiles: Map<string, DomainTileState>) => (playerId: string) => [...tiles.values()].filter((t) => t.town && t.ownerId === playerId).map((t) => `${t.x},${t.y}`);
const territory = (tiles: Map<string, DomainTileState>) => (playerId: string) => [...tiles.values()].filter((t) => t.ownerId === playerId).map((t) => `${t.x},${t.y}`);

describe("live Longest Road", () => {
  it("names the holder and agrees with the season record", () => {
    const tiles = world();
    const live = computeLiveLongestRoad({ tiles: () => tiles, players: () => players, townTileKeys: townTileKeys(tiles), territoryTileKeys: territory(tiles) });
    expect(live).toEqual({ playerId: "p1", playerName: "Waypoint", tileCount: 4, fromTown: "Brine", toTown: "Ash" });
    const exported = [...tiles.values()].map((t) => ({ x: t.x, y: t.y, terrain: t.terrain, ownerId: t.ownerId, ownershipState: t.ownershipState, townName: t.town?.name, townPopulationTier: t.town?.populationTier }));
    expect(computeLongestRoad(exported as never, [...players.values()])?.tileCount).toBe(live?.tileCount);
  });

  it("checks one empire per tick, pushes to online humans when the holder changes, and waits 4 hours between passes", () => {
    const tiles = world();
    const sent: Array<{ playerId: string; road: unknown }> = [];
    const ticker = createLongestRoadTicker({ tiles: () => tiles, players: () => players, townTileKeys: townTileKeys(tiles), territoryTileKeys: territory(tiles), isPlayerSubscribed: (id) => id === "p2", emitPlayerMessage: (command, payload) => sent.push({ playerId: command.playerId, road: payload.road }) });
    ticker.sendTo("p2"); // nothing known yet
    ticker.tick(0); // p1 checked
    expect(sent).toHaveLength(0);
    ticker.tick(1_000); // p2 checked, pass done
    expect(sent).toEqual([{ playerId: "p2", road: expect.objectContaining({ playerId: "p1", tileCount: 4 }) }]);
    tiles.delete("12,10"); // p1's road is cut
    ticker.tick(2_000);
    ticker.tick(LONGEST_ROAD_PASS_INTERVAL_MS - 1); // still inside the 4 hours
    expect(sent).toHaveLength(1);
    expect(LONGEST_ROAD_PASS_INTERVAL_MS).toBe(4 * 60 * 60_000);
    ticker.tick(LONGEST_ROAD_PASS_INTERVAL_MS);
    ticker.tick(LONGEST_ROAD_PASS_INTERVAL_MS + 1_000);
    expect(sent.at(-1)?.road).toEqual(expect.objectContaining({ playerId: "p2", tileCount: 2 }));
    ticker.tick(LONGEST_ROAD_PASS_INTERVAL_MS * 2);
    ticker.tick(LONGEST_ROAD_PASS_INTERVAL_MS * 2 + 1_000);
    expect(sent).toHaveLength(2);
  });
});
