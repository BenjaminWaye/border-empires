import { describe, expect, it } from "vitest";

import { activeAlliancesView, allianceBreaksView, truceWatchView } from "./social-activity-views.js";
import type { SocialStoreSnapshot } from "../social-store/social-store.js";

const baseSnapshot: SocialStoreSnapshot = {
  players: [],
  allianceRecords: [],
  allianceRequests: [],
  activeAllianceBreaks: [],
  completedAllianceBreaks: [],
  truceRequests: [],
  activeTruces: [],
  truceLockouts: []
};

describe("activeAlliancesView", () => {
  it("maps allianceRecords to playerA/playerB/since, sorted by since", () => {
    const snapshot: SocialStoreSnapshot = {
      ...baseSnapshot,
      allianceRecords: [
        { playerAId: "p2", playerBId: "p3", createdAt: 200 },
        { playerAId: "p1", playerBId: "p2", createdAt: 100 }
      ]
    };
    expect(activeAlliancesView(snapshot)).toEqual([
      { playerA: "p1", playerB: "p2", since: 100 },
      { playerA: "p2", playerB: "p3", since: 200 }
    ]);
  });
});

describe("allianceBreaksView", () => {
  it("maps active (not completed) alliance breaks, newest first", () => {
    const snapshot: SocialStoreSnapshot = {
      ...baseSnapshot,
      activeAllianceBreaks: [
        { playerAId: "p1", playerBId: "p2", startedAt: 100, endsAt: 200, createdByPlayerId: "p1" },
        { playerAId: "p3", playerBId: "p4", startedAt: 300, endsAt: 400, createdByPlayerId: "p4" }
      ],
      completedAllianceBreaks: [
        { playerAId: "p5", playerBId: "p6", startedAt: 1, endsAt: 2, createdByPlayerId: "p5", finalizedAt: 2, notificationExpiresAt: 3 }
      ]
    };
    expect(allianceBreaksView(snapshot)).toEqual([
      { playerA: "p3", playerB: "p4", brokenBy: "p4", brokenAt: 300, noticeEndsAt: 400 },
      { playerA: "p1", playerB: "p2", brokenBy: "p1", brokenAt: 100, noticeEndsAt: 200 }
    ]);
  });
});

describe("truceWatchView", () => {
  it("maps active truces sorted by endsAt ascending", () => {
    const snapshot: SocialStoreSnapshot = {
      ...baseSnapshot,
      activeTruces: [
        { playerAId: "p1", playerBId: "p2", startedAt: 0, endsAt: 500, createdByPlayerId: "p1" },
        { playerAId: "p3", playerBId: "p4", startedAt: 0, endsAt: 100, createdByPlayerId: "p3" }
      ]
    };
    expect(truceWatchView(snapshot)).toEqual([
      { playerA: "p3", playerB: "p4", endsAt: 100 },
      { playerA: "p1", playerB: "p2", endsAt: 500 }
    ]);
  });
});
