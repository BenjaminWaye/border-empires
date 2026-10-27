import { describe, expect, it, vi } from "vitest";

import { allianceAnnouncementTitle, applyAllianceUpdateMessage, applyTruceUpdateMessage, endedTruces } from "./client-diplomacy-notifications.js";

const allianceState = () => ({
  allies: [] as string[],
  activeAllianceBreaks: [],
  recentAllianceBreaks: [],
  incomingAllianceRequests: [],
  outgoingAllianceRequests: []
});

describe("alliance announcements", () => {
  // Regression: every non-"now broken" alliance announcement used to be
  // titled "Alliance break notice", including an AI's answer to an offer.
  it("titles AI alliance answers as formed or declined", () => {
    expect(allianceAnnouncementTitle("Milo accepted your alliance. Milo fears your strength.")).toEqual({ title: "Alliance formed", tone: "success" });
    expect(allianceAnnouncementTitle("Milo declined your alliance offer. Milo is wary of you.")).toEqual({ title: "Alliance declined", tone: "warn" });
  });

  it("keeps the existing break titles", () => {
    expect(allianceAnnouncementTitle("Your alliance with Valka is now broken.").title).toBe("Alliance broken");
    expect(allianceAnnouncementTitle("Valka started a 24h notice to break your alliance.").title).toBe("Alliance break notice");
  });

  it("applies the update and puts the announcement in the feed, not a popup", () => {
    const state = allianceState();
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();
    applyAllianceUpdateMessage(state, { allies: ["ai-1"], announcement: "Milo accepted your alliance. Milo fears your strength." }, { pushFeed, showCaptureAlert });

    expect(state.allies).toEqual(["ai-1"]);
    expect(pushFeed).toHaveBeenCalledWith("Milo accepted your alliance. Milo fears your strength.", "alliance", "success");
    expect(showCaptureAlert).not.toHaveBeenCalled();
  });
});

const truceState = (activeTruces: Array<{ otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number; createdByPlayerId: string }> = []) => ({
  activeTruces,
  truceBreaksThisSeason: [],
  incomingTruceRequests: [],
  outgoingTruceRequests: []
});

describe("truce announcements", () => {
  it("feeds accepted and declined answers without a popup", () => {
    const state = truceState();
    const deps = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    applyTruceUpdateMessage(state, { announcement: "Milo accepted your 12h truce. Milo fears your strength." }, deps);
    applyTruceUpdateMessage(state, { announcement: "Milo declined your 12h truce offer. Milo feels they're winning and wants to keep fighting." }, deps);

    expect(deps.pushFeed.mock.calls.map((call) => call[2])).toEqual(["success", "warn"]);
    expect(deps.showCaptureAlert).not.toHaveBeenCalled();
  });

  // Regression: every announcement that was neither "declined" nor "broke"
  // used to pop up titled "Truce accepted", the Court armistice included.
  it("never titles a Court armistice as an accepted truce", () => {
    const deps = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    applyTruceUpdateMessage(truceState(), { announcement: "Valka invoked a Court mandate: a binding 12h armistice with Milo." }, deps);

    expect(deps.pushFeed).toHaveBeenCalledWith("Valka invoked a Court mandate: a binding 12h armistice with Milo.", "alliance", "success");
    expect(deps.showCaptureAlert).not.toHaveBeenCalled();
  });

  it("pops up only for the player whose truce was broken", () => {
    const victim = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    applyTruceUpdateMessage(truceState(), { announcement: "Valka broke the truce with Milo." }, victim);
    expect(victim.showCaptureAlert).toHaveBeenCalledWith("Truce broken", "Valka broke the truce with Milo.", "warn");

    const breaker = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    applyTruceUpdateMessage(truceState(), { announcement: "Valka broke the truce with Milo early and is locked out of new truces for 24h." }, breaker);
    expect(breaker.pushFeed).toHaveBeenCalledWith("Valka broke the truce with Milo early and is locked out of new truces for 24h.", "alliance", "warn");
    expect(breaker.showCaptureAlert).not.toHaveBeenCalled();
  });

  it("feeds a quiet line when a truce runs out, without a popup", () => {
    const tove = { otherPlayerId: "p2", otherPlayerName: "Tove", startedAt: 0, endsAt: 1, createdByPlayerId: "p2" };
    const milo = { otherPlayerId: "p3", otherPlayerName: "Milo", startedAt: 0, endsAt: 2, createdByPlayerId: "p3" };
    const state = truceState([tove, milo]);
    const deps = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    applyTruceUpdateMessage(state, { activeTruces: [milo] }, deps);

    expect(state.activeTruces).toEqual([milo]);
    expect(deps.pushFeed).toHaveBeenCalledWith("Your truce with Tove has ended.", "alliance", "info");
    expect(deps.showCaptureAlert).not.toHaveBeenCalled();
  });

  it("does not report an ending for an update that omits the truce list", () => {
    const deps = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    applyTruceUpdateMessage(truceState([{ otherPlayerId: "p2", otherPlayerName: "Tove", startedAt: 0, endsAt: 1, createdByPlayerId: "p2" }]), { incomingTruceRequests: [] }, deps);
    expect(deps.pushFeed).not.toHaveBeenCalled();
  });

  it("lists truces that left the active list", () => {
    const a = { otherPlayerId: "a", otherPlayerName: "A", startedAt: 0, endsAt: 1, createdByPlayerId: "a" };
    const b = { ...a, otherPlayerId: "b", otherPlayerName: "B" };
    expect(endedTruces([a, b], [b])).toEqual([a]);
    expect(endedTruces([a], [a])).toEqual([]);
  });
});
