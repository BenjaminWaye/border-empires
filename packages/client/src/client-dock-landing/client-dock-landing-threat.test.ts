import { describe, expect, it } from "vitest";
import type { ActiveTruceView, DockPair, Tile } from "../client-types.js";
import { hostileLandingGroundKeys } from "./client-dock-landing-threat.js";

// My dock (5,5) on a west-facing shore, linked to a far dock (40,40).
// (5,4) and (5,6) are my beaches; (6,5) is inland.
const tile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...overrides });
const truce = (otherPlayerId: string, endsAt: number): ActiveTruceView => ({ otherPlayerId, otherPlayerName: otherPlayerId, startedAt: 0, endsAt, createdByPlayerId: "me" });
const world = (farOwner: string | undefined, extra: Partial<{ allies: string[]; activeTruces: ActiveTruceView[] }> = {}) => {
  const tiles = new Map<string, Tile>();
  const put = (t: Tile) => tiles.set(`${t.x},${t.y}`, t);
  for (let y = 3; y <= 7; y += 1) put(tile(4, y, { terrain: "SEA" }));
  for (let y = 3; y <= 7; y += 1) for (let x = 5; x <= 7; x += 1) put(tile(x, y, { ownerId: "me", ownershipState: "SETTLED" }));
  put(tile(5, 5, { ownerId: "me", ownershipState: "SETTLED", dockId: "dock-a" }));
  put(tile(40, 40, { dockId: "dock-b", ...(farOwner ? { ownerId: farOwner, ownershipState: "SETTLED" as const } : {}) }));
  const dockPairs: DockPair[] = [{ ax: 5, ay: 5, bx: 40, by: 40 }];
  return { tiles, dockPairs, me: "me", allies: extra.allies ?? [], activeTruces: extra.activeTruces ?? [] };
};
const NOW = 1_000;

describe("hostileLandingGroundKeys", () => {
  it("marks my coast where an enemy-held dock's crossings can land", () => {
    expect(hostileLandingGroundKeys(world("enemy"), new Set(), NOW)).toEqual(new Set(["5,5", "5,4", "5,6"]));
  });

  it("marks nothing while the far dock is neutral, mine, an ally's or a live truce partner's", () => {
    expect(hostileLandingGroundKeys(world(undefined), new Set(), NOW).size).toBe(0);
    expect(hostileLandingGroundKeys(world("me"), new Set(), NOW).size).toBe(0);
    expect(hostileLandingGroundKeys(world("friend", { allies: ["friend"] }), new Set(), NOW).size).toBe(0);
    expect(hostileLandingGroundKeys(world("truced", { activeTruces: [truce("truced", NOW + 1)] }), new Set(), NOW).size).toBe(0);
  });

  it("marks again once a truce has run out", () => {
    const state = world("truced", { activeTruces: [truce("truced", NOW - 1)] });
    expect(hostileLandingGroundKeys(state, new Set(), NOW).size).toBe(3);
  });

  it("includes neutral landing ground inside my reach, not neutral ground outside it", () => {
    const state = world("enemy");
    state.tiles.set("5,6", tile(5, 6));
    expect(hostileLandingGroundKeys(state, new Set(), NOW).has("5,6")).toBe(false);
    expect(hostileLandingGroundKeys(state, new Set(["5,6"]), NOW).has("5,6")).toBe(true);
  });
});
