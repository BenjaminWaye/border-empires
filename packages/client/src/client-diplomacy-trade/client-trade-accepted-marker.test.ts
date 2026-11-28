import { afterEach, describe, expect, it, vi } from "vitest";

import type { Tile } from "../client-types.js";
import { applyResourceTradeMessage } from "./client-player-resource-state.js";
import { createInitialResourceTradeState } from "./client-resource-trade-state.js";
import { pendingActionMarkers, resetActionMarkers } from "../client-action-markers/client-action-markers.js";

const accepted = { type: "RESOURCE_TRADE_ACCEPTED", offerId: "o1", fromPlayerId: "me", toPlayerId: "ai-3", fromPlayerName: "Iron Marches", toPlayerName: "Tove" };
/** The newest map marker as "label@x,y". */
const markerText = (): string | undefined => { const m = pendingActionMarkers().at(-1); return m ? `${m.label}@${m.x},${m.y}` : undefined; };
const tile = (x: number, y: number, ownerId: string): [string, Tile] => [`${x},${y}`, { x, y, terrain: "LAND", ownerId } as Tile];
const tradeState = (me: string) => ({
  ...createInitialResourceTradeState(), me, camX: 0, camY: 0,
  tiles: new Map([tile(5, 5, "ai-3"), tile(2, 2, "me")])
});

afterEach(() => resetActionMarkers());

// Regression (first-15 playtest r1, pt-diplomat): "There was no 'Tove accepted!' moment… my coin dropped."
// Owner (2026-11-28): a marker on the map at the other House's land, the words in the feed.
describe("RESOURCE_TRADE_ACCEPTED", () => {
  it("marks the proposer's trade on the other House's land and says who in the feed", () => {
    const pushFeed = vi.fn();
    expect(applyResourceTradeMessage(tradeState("me"), accepted, pushFeed)).toBe(true);
    expect(markerText()).toBe("Trade agreed@5,5");
    expect(pushFeed).toHaveBeenCalledWith("Tove accepted your trade", "alliance", "success");
  });

  it("marks it on the proposer's land for the House that accepted", () => {
    const pushFeed = vi.fn();
    applyResourceTradeMessage(tradeState("ai-3"), accepted, pushFeed);
    expect(markerText()).toBe("Trade agreed@2,2");
    expect(pushFeed).toHaveBeenCalledWith("Trade with Iron Marches agreed", "alliance", "success");
  });

  it("keeps it to the feed when none of the other House's land is known", () => {
    const pushFeed = vi.fn();
    applyResourceTradeMessage({ ...tradeState("me"), tiles: new Map() }, accepted, pushFeed);
    expect(markerText()).toBeUndefined();
    expect(pushFeed).toHaveBeenCalledOnce();
  });

  it("shows nothing for a plain offers update", () => {
    applyResourceTradeMessage(tradeState("me"), { type: "RESOURCE_TRADE_UPDATE", offers: [] });
    expect(markerText()).toBeUndefined();
  });
});
