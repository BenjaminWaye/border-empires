import { describe, expect, it } from "vitest";
import type { Tile, TileMenuView } from "../client-types.js";
import { offerSentTitle } from "./client-hud-v2-screens.js";
import { tileFactsFor } from "./client-hud-v2-tile-facts.js";
import { captureIsBattle } from "./client-hud-v2-tracker.js";

const tile = (patch: Partial<Tile>): Tile => ({ x: 1, y: 1, terrain: "LAND", ...patch }) as Tile;
const noView: Pick<TileMenuView, "combatBreakdown" | "overviewLines"> = { overviewLines: [] };

describe("HUD v2 review fixes", () => {
  // Review: opening a deal sends a stance lookup, which raised a false "Truce offered" alert.
  it("only confirms real truce and alliance offers", () => {
    expect(offerSentTitle({ type: "TRUCE_REQUEST", durationHours: 24 })).toBe("Truce offered · 24h");
    expect(offerSentTitle({ type: "ALLIANCE_REQUEST" })).toBe("Alliance offered");
    expect(offerSentTitle({ type: "DIPLOMACY_STANCE_REQUEST" })).toBeUndefined();
    expect(offerSentTitle(null)).toBeUndefined();
  });

  it("tells an attack from a frontier expansion", () => {
    expect(captureIsBattle({ actionType: "ATTACK" })).toBe(true);
    expect(captureIsBattle({ combatSnapshot: { winChance: 0.5 } })).toBe(true);
    expect(captureIsBattle({ actionType: "EXPAND" })).toBe(false);
    expect(captureIsBattle({})).toBe(false);
  });

  // Review: the strip showed worst-case upkeep for Relay Beacons (the first ones are free) and Observatories.
  it("leaves count-dependent upkeep to Details", () => {
    const facts = tileFactsFor(tile({ ownerId: "me", ownershipState: "SETTLED", economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" } }), noView, "me");
    expect(facts.map((f) => f.label)).not.toContain("Upkeep");
  });

  // Review: a rival's garrisoned relic read "Dormant", and rival towns would read "Coin 0.0/day".
  it("describes rival wonders and towns without your-only data", () => {
    const relic = tileFactsFor(tile({ ownerId: "them", ownershipState: "SETTLED", naturalWonder: { type: "DEEPWATER_ENGINE", relicVersion: 1 } }), noView, "me");
    expect(relic).toContainEqual({ label: "State", value: "Held" });
    const town = { populationTier: "TOWN", isFed: true } as NonNullable<Tile["town"]>;
    const rivalTown = tileFactsFor(tile({ ownerId: "them", ownershipState: "SETTLED", town }), noView, "me");
    expect(rivalTown.map((f) => f.label)).not.toContain("Coin");
  });
});
