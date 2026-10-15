import { describe, expect, it, vi } from "vitest";

import { allianceAnnouncementTitle, applyAllianceUpdateMessage, applyTruceUpdateMessage } from "./client-diplomacy-notifications.js";

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

  it("applies the update and surfaces the announcement", () => {
    const state = allianceState();
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();
    applyAllianceUpdateMessage(state, { allies: ["ai-1"], announcement: "Milo accepted your alliance. Milo fears your strength." }, { pushFeed, showCaptureAlert });

    expect(state.allies).toEqual(["ai-1"]);
    expect(pushFeed).toHaveBeenCalledWith("Milo accepted your alliance. Milo fears your strength.", "alliance", "success");
    expect(showCaptureAlert).toHaveBeenCalledWith("Alliance formed", "Milo accepted your alliance. Milo fears your strength.", "success");
  });
});

describe("truce announcements", () => {
  it("titles an AI's reasoned truce answers by accepted/declined", () => {
    const state = { activeTruces: [], truceBreaksThisSeason: [], incomingTruceRequests: [], outgoingTruceRequests: [] };
    const showCaptureAlert = vi.fn();
    const deps = { pushFeed: vi.fn(), showCaptureAlert };
    applyTruceUpdateMessage(state, { announcement: "Milo accepted your 12h truce. Milo fears your strength." }, deps);
    applyTruceUpdateMessage(state, { announcement: "Milo declined your 12h truce offer. Milo feels they're winning and wants to keep fighting." }, deps);

    expect(showCaptureAlert.mock.calls.map((call) => call[0])).toEqual(["Truce accepted", "Truce declined"]);
  });
});
