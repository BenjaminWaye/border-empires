import { beforeEach, describe, expect, it, vi } from "vitest";

// Owner decision 2026-11-28 (PR #3063 review): the guided camp flight's look holds until the camp falls or the
// player moves past the guide's chapter. Only the client knows the second, so it says SCOUT_CAMP_LEAD_DONE.
let guideActive = true;
vi.mock("../client-tutorial-guide/tutorial-guide-storage.js", () => ({ isGuideActive: () => guideActive }));

const { resetScoutCampLeadReleaseForTests, syncScoutCampLeadRelease } = await import("./client-scout-drone-camp-release.js");

type State = Parameters<typeof syncScoutCampLeadRelease>[0];
const state = (reportId?: string): State => ({ connection: "initialized", authEmail: "a@b.c", scoutDroneReport: reportId ? ({ id: reportId } as State["scoutDroneReport"]) : undefined }) as State;

describe("SCOUT_CAMP_LEAD_DONE", () => {
  beforeEach(() => {
    guideActive = true;
    resetScoutCampLeadReleaseForTests();
  });

  it("says nothing while the guide runs, then once when it stops", () => {
    const sent: unknown[] = [];
    const send = (message: unknown): boolean => (sent.push(message), true);
    syncScoutCampLeadRelease(state("r1"), send);
    expect(sent).toEqual([]);
    guideActive = false;
    syncScoutCampLeadRelease(state("r1"), send);
    syncScoutCampLeadRelease(state("r1"), send);
    expect(sent).toEqual([{ type: "SCOUT_CAMP_LEAD_DONE" }]);
    // A later landing (a later free camp flight) is said again.
    syncScoutCampLeadRelease(state("r2"), send);
    expect(sent).toHaveLength(2);
  });

  it("retries a send the session refused, and waits for a live session", () => {
    guideActive = false;
    const offline = { ...state(), connection: "connecting" } as State;
    let accept = false;
    let tries = 0;
    const send = (): boolean => (tries += 1, accept);
    syncScoutCampLeadRelease(offline, send);
    expect(tries).toBe(0);
    syncScoutCampLeadRelease(state(), send);
    accept = true;
    syncScoutCampLeadRelease(state(), send);
    syncScoutCampLeadRelease(state(), send);
    expect(tries).toBe(2);
  });
});
