import { afterEach, describe, expect, it, vi } from "vitest";

import type { Tile } from "../client-types.js";
import { applyAllianceUpdateMessage, applyTruceUpdateMessage } from "./client-diplomacy-notifications.js";
import { pendingActionMarkers, resetActionMarkers } from "../client-action-markers/client-action-markers.js";

/** The newest map marker as "label@x,y". */
const markerText = (): string | undefined => { const m = pendingActionMarkers().at(-1); return m ? `${m.label}@${m.x},${m.y}` : undefined; };
const deps = () => ({ pushFeed: vi.fn(), showCaptureAlert: vi.fn() });
const offer = { id: "t1", fromPlayerId: "me", toPlayerId: "ai-2", createdAt: 1, expiresAt: 2, durationHours: 12 };
const land = (x: number, y: number, extra: Partial<Tile> = {}): [string, Tile] =>
  [`${x},${y}`, { x, y, terrain: "LAND", ownerId: "ai-2", ownershipState: "SETTLED", ...extra } as Tile];
const truceState = (tiles: Array<[string, Tile]>) => ({
  activeTruces: [], truceBreaksThisSeason: [], incomingTruceRequests: [], outgoingTruceRequests: [offer],
  tiles: new Map(tiles), camX: 10, camY: 10
});

afterEach(() => resetActionMarkers());

// Regression (first-15 playtest r1, pt-diplomat): "Sent, accepted silently." An agreed deal went only to
// the Activity feed, which players can't open. Owner (2026-11-28): show it on the map, not as a toast; a deal
// has no tile, so it stands on the other House's nearest land in sight, or their capital.
describe("agreed deal marker", () => {
  it("marks an accepted truce on the other House's land nearest the camera", () => {
    applyTruceUpdateMessage(truceState([land(40, 40), land(12, 11), land(11, 9, { ownerId: "ai-9" })]) as never,
      { outgoingTruceRequests: [], announcement: "Bryn accepted your 12h truce. Bryn wants peace." }, deps());
    expect(markerText()).toBe("Truce agreed@12,11");
  });

  it("skips fogged land for the nearest tile but falls back to a known capital", () => {
    applyTruceUpdateMessage(truceState([land(11, 11, { fogged: true }), land(80, 80, { fogged: true, capital: true })]) as never,
      { outgoingTruceRequests: [], announcement: "Bryn accepted your 12h truce." }, deps());
    expect(markerText()).toBe("Truce agreed@80,80");
  });

  it("puts nothing on the map when none of their land is known; the feed still has it", () => {
    const d = deps();
    applyTruceUpdateMessage(truceState([]) as never, { outgoingTruceRequests: [], announcement: "Bryn accepted your 12h truce." }, d);
    expect(markerText()).toBeUndefined();
    expect(d.pushFeed).toHaveBeenCalledWith("Bryn accepted your 12h truce.", "alliance", "success");
  });

  it("shows nothing when the truce is declined (that keeps its alert)", () => {
    const d = deps();
    applyTruceUpdateMessage(truceState([land(12, 11)]) as never,
      { outgoingTruceRequests: [], announcement: "Bryn declined your 12h truce offer. Bryn wants your land." }, d);
    expect(markerText()).toBeUndefined();
    expect(d.showCaptureAlert).toHaveBeenCalled();
  });

  it("shows nothing for an announcement that answers no offer of yours", () => {
    const state = { ...truceState([land(12, 11)]), outgoingTruceRequests: [] };
    applyTruceUpdateMessage(state as never, { announcement: "Valka invoked a Court mandate: a binding 12h armistice with Milo." }, deps());
    expect(markerText()).toBeUndefined();
  });

  it("marks an alliance offer you accepted on the new ally's land", () => {
    const state = {
      allies: [], activeAllianceBreaks: [], recentAllianceBreaks: [], outgoingAllianceRequests: [],
      incomingAllianceRequests: [{ ...offer, fromPlayerId: "ai-2", toPlayerId: "me" }],
      me: "me", tiles: new Map([land(14, 10)]), camX: 10, camY: 10
    };
    applyAllianceUpdateMessage(state as never, { allies: ["ai-2"], incomingAllianceRequests: [], announcement: "You accepted Milo's alliance offer." }, deps());
    expect(markerText()).toBe("Alliance formed@14,10");
  });
});
