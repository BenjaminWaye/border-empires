// @vitest-environment happy-dom
// Playtest run 5 (pt-predator): accepting Maren's truce failed with "Maren
// withdrew its offer" while Accept was still on screen. A withdrawn offer now
// leaves the offer bar and Diplomacy at once, with a terse warn line.
import { describe, expect, it, vi } from "vitest";

import { offerDockEntries } from "../client-diplomacy-offer-dock/client-diplomacy-offer-dock.js";
import type { AllianceRequest, TruceRequest } from "../client-types.js";
import { handleDiplomacySocketMessage } from "./client-diplomacy-messages.js";

const truce: TruceRequest = { id: "t1", fromPlayerId: "maren", toPlayerId: "me", createdAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, durationHours: 12, fromName: "Maren" };
const alliance: AllianceRequest = { id: "a1", fromPlayerId: "maren", toPlayerId: "me", createdAt: 0, fromName: "Maren" };
const state = () => ({
  me: "me",
  notifiedIncomingDiplomacyRequestIds: new Set<string>(),
  notifiedDiplomacyIdsLoadedFor: "",
  allies: [] as string[],
  activeAllianceBreaks: [],
  recentAllianceBreaks: [],
  incomingAllianceRequests: [alliance],
  outgoingAllianceRequests: [],
  activeTruces: [],
  truceBreaksThisSeason: [],
  incomingTruceRequests: [truce],
  outgoingTruceRequests: []
});
const deps = () => ({ pushFeed: vi.fn(), showCaptureAlert: vi.fn(), playerNameForOwner: () => undefined });

describe("withdrawn offers", () => {
  it("drops the offer named by a DIPLOMACY_OFFER_WITHDRAWN error and leaves the error to the usual alert", () => {
    const s = state();
    const handled = handleDiplomacySocketMessage(s, { type: "ERROR", code: "DIPLOMACY_OFFER_WITHDRAWN", message: "Maren withdrew its offer.", requestId: "t1" }, deps());
    expect(handled).toBe(false);
    expect(s.incomingTruceRequests).toEqual([]);
    expect(s.incomingAllianceRequests).toEqual([alliance]);
    expect(offerDockEntries(s, new Map(), new Set(), 0, () => undefined).map((entry) => entry.id)).toEqual(["a1"]);
  });

  it("logs the server's withdraw line as a warning for truces and alliances", () => {
    const d = deps();
    handleDiplomacySocketMessage(state(), { type: "TRUCE_UPDATE", incomingTruceRequests: [], announcement: "Maren withdrew the truce offer." }, d);
    handleDiplomacySocketMessage(state(), { type: "ALLIANCE_UPDATE", allies: [], incomingAllianceRequests: [], announcement: "Maren withdrew the alliance offer." }, d);
    expect(d.pushFeed).toHaveBeenNthCalledWith(1, "Maren withdrew the truce offer.", "alliance", "warn");
    expect(d.pushFeed).toHaveBeenNthCalledWith(2, "Maren withdrew the alliance offer.", "alliance", "warn");
  });
});
