import { describe, expect, it } from "vitest";
import type { ActiveBattleOverlay } from "../client-battle-overlay/client-battle-overlay.js";
import type { ActiveTruceView, Tile } from "../client-types.js";
import { WAR_STATUS_HOLD_MS, warOpponentIds, type WarStatusState } from "./client-war-status.js";

// A patch of neutral land (x 10..44, y 10..30); "me" owns (20,20) and (21,20).
const NOW = 1_000_000;

const land = (x: number, y: number, ownerId?: string): Tile =>
  ({ x, y, terrain: "LAND", ...(ownerId ? { ownerId, ownershipState: "FRONTIER" } : {}) }) as Tile;

const makeState = (): WarStatusState & { tiles: Map<string, Tile>; activeBattles: Map<string, ActiveBattleOverlay>; activeTruces: ActiveTruceView[] } => {
  const tiles = new Map<string, Tile>();
  for (let x = 10; x <= 44; x += 1) for (let y = 10; y <= 30; y += 1) tiles.set(`${x},${y}`, land(x, y));
  tiles.set("20,20", land(20, 20, "me"));
  tiles.set("21,20", land(21, 20, "me"));
  return { me: "me", allies: [], activeTruces: [], tiles, activeBattles: new Map() } as never;
};

const put = (state: { tiles: Map<string, Tile> }, tile: Tile): void => void state.tiles.set(`${tile.x},${tile.y}`, tile);

const flag = (state: { tiles: Map<string, Tile> }, x: number, y: number, ownerId: string, mode: "HOLD" | "ADVANCE" = "HOLD"): void =>
  put(state, {
    ...(state.tiles.get(`${x},${y}`) ?? land(x, y, ownerId)),
    muster: { ownerId, amount: 0, mode, updatedAt: 0, ...(mode === "HOLD" ? {} : { nextActionAt: NOW + 5_000 }) }
  } as Tile);

const battle = (attackerOwnerId: string, defenderOwnerId: string): ActiveBattleOverlay =>
  ({ attackerOwnerId, defenderOwnerId, endAt: NOW + 5_000 }) as ActiveBattleOverlay;

describe("warOpponentIds", () => {
  it("is empty for a met neighbour with no flags or battles", () => {
    const state = makeState();
    put(state, land(22, 20, "rival"));
    expect(warOpponentIds(state, NOW).size).toBe(0);
  });

  it("includes a neighbour whose land is in reach of our engaged flag", () => {
    const state = makeState();
    put(state, land(22, 20, "rival"));
    flag(state, 20, 20, "me", "ADVANCE");
    expect([...warOpponentIds(state, NOW)]).toEqual(["rival"]);
  });

  it("includes a player whose flag has our land in reach", () => {
    const state = makeState();
    put(state, land(25, 20, "rival"));
    flag(state, 25, 20, "rival");
    expect([...warOpponentIds(state, NOW)]).toEqual(["rival"]);
  });

  it("ignores a far-away player's flag", () => {
    const state = makeState();
    put(state, land(40, 28, "rival"));
    flag(state, 40, 28, "rival");
    expect(warOpponentIds(state, NOW).size).toBe(0);
  });

  it("names only the opponent we are fighting, not other empires' fights", () => {
    const state = makeState();
    state.activeBattles.set("a", battle("me", "rival"));
    state.activeBattles.set("b", battle("other", "third"));
    expect([...warOpponentIds(state, NOW)]).toEqual(["rival"]);
  });

  it("holds war after a battle ends, then returns to peace", () => {
    const state = makeState();
    state.activeBattles.set("a", battle("rival", "me"));
    expect(warOpponentIds(state, NOW).has("rival")).toBe(true);
    state.activeBattles.clear();
    expect(warOpponentIds(state, NOW + WAR_STATUS_HOLD_MS - 1).has("rival")).toBe(true);
    expect(warOpponentIds(state, NOW + WAR_STATUS_HOLD_MS + 1).has("rival")).toBe(false);
  });

  it("never counts a truce partner or ally, even mid-battle", () => {
    const state = makeState();
    put(state, land(22, 20, "rival"));
    state.activeTruces.push({ otherPlayerId: "rival", otherPlayerName: "rival", startedAt: 0, endsAt: NOW + 60_000, createdByPlayerId: "me" });
    state.allies = ["friend"];
    flag(state, 20, 20, "me", "ADVANCE");
    state.activeBattles.set("a", battle("me", "rival"));
    state.activeBattles.set("b", battle("friend", "me"));
    expect(warOpponentIds(state, NOW).size).toBe(0);
  });
});
