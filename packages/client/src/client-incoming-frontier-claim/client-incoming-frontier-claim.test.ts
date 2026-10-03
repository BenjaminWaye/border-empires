import { describe, expect, it } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { activeIncomingFrontierClaims } from "./client-incoming-frontier-claim.js";
import type { ClientState } from "../client-state/client-state.js";

const stateWith = (ownershipState: "FRONTIER" | "SETTLED", transitEndsAt?: number): ClientState =>
  ({
    me: "me-1",
    tiles: new Map([["155,12", { x: 155, y: 12, terrain: "LAND", ownerId: "me-1", ownershipState }]]),
    incomingAttacksByTile: new Map([
      ["155,12", { attackerName: "Edvin", attackerId: "ai-5", resolvesAt: 100_000, fromX: 156, fromY: 12, ...(transitEndsAt !== undefined ? { transitEndsAt } : {}) }]
    ])
  }) as unknown as ClientState;

// Regression: an enemy capturing this player's FRONTIER tile showed only the
// red cross -- no soldiers (skirmish FX skips FRONTIER) and no claim sweep
// (plates only covered this player's own attacks).
describe("activeIncomingFrontierClaims", () => {
  it("reports an enemy attack on my FRONTIER tile as an in-progress capture", () => {
    const [claim] = activeIncomingFrontierClaims(stateWith("FRONTIER"), 90_000);
    expect(claim).toMatchObject({ key: "155,12", attackerId: "ai-5", fromX: 156, fromY: 12, resolvesAt: 100_000 });
    expect(claim?.startAt).toBe(100_000 - COMBAT_LOCK_MS);
  });

  it("ignores SETTLED tiles (those get the skirmish/clash FX instead)", () => {
    expect(activeIncomingFrontierClaims(stateWith("SETTLED"), 90_000)).toEqual([]);
  });

  it("waits for the attacker's march to arrive, then starts the sweep at arrival", () => {
    expect(activeIncomingFrontierClaims(stateWith("FRONTIER", 95_000), 90_000)).toEqual([]);
    expect(activeIncomingFrontierClaims(stateWith("FRONTIER", 95_000), 96_000)[0]?.startAt).toBe(95_000);
  });
});
