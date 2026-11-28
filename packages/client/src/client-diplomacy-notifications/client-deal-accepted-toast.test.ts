// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyAllianceUpdateMessage, applyTruceUpdateMessage } from "./client-diplomacy-notifications.js";

const toastText = (): string | null | undefined => document.getElementById("action-toast")?.textContent;
const deps = () => ({ pushFeed: vi.fn(), showCaptureAlert: vi.fn() });
const offer = { id: "t1", fromPlayerId: "me", toPlayerId: "ai-2", createdAt: 1, expiresAt: 2, durationHours: 12 };

afterEach(() => document.getElementById("action-toast")?.remove());

// Regression (first-15 playtest r1, pt-diplomat): "Sent, accepted silently." An agreed deal went only to
// the Activity feed, which players can't open, so the only sign was the coin dropping.
describe("agreed deal confirmation", () => {
  it("shows the first sentence when the AI accepts your truce", () => {
    const state = { activeTruces: [], truceBreaksThisSeason: [], incomingTruceRequests: [], outgoingTruceRequests: [offer] };
    applyTruceUpdateMessage(state as never, { outgoingTruceRequests: [], announcement: "Bryn accepted your 12h truce. Bryn wants peace." }, deps());
    expect(toastText()).toBe("Bryn accepted your 12h truce.");
  });

  it("shows nothing when the truce is declined (that keeps its alert)", () => {
    const state = { activeTruces: [], truceBreaksThisSeason: [], incomingTruceRequests: [], outgoingTruceRequests: [offer] };
    const d = deps();
    applyTruceUpdateMessage(state as never, { outgoingTruceRequests: [], announcement: "Bryn declined your 12h truce offer. Bryn wants your land." }, d);
    expect(toastText()).toBeUndefined();
    expect(d.showCaptureAlert).toHaveBeenCalled();
  });

  it("shows nothing for an announcement that answers no offer of yours", () => {
    const state = { activeTruces: [], truceBreaksThisSeason: [], incomingTruceRequests: [], outgoingTruceRequests: [] };
    applyTruceUpdateMessage(state as never, { announcement: "Valka invoked a Court mandate: a binding 12h armistice with Milo." }, deps());
    expect(toastText()).toBeUndefined();
  });

  it("confirms an alliance offer you accepted", () => {
    const state = { allies: [], activeAllianceBreaks: [], recentAllianceBreaks: [], incomingAllianceRequests: [{ ...offer, fromPlayerId: "ai-2", toPlayerId: "me" }], outgoingAllianceRequests: [] };
    applyAllianceUpdateMessage(state as never, { allies: ["ai-2"], incomingAllianceRequests: [], announcement: "You accepted Milo's alliance offer." }, deps());
    expect(toastText()).toBe("You accepted Milo's alliance offer.");
  });
});
