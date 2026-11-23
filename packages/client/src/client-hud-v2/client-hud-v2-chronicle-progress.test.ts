// Visit loop report (docs/visit-as-a-turn.md §2.1): the Chronicle shows how far the player's victory
// paths moved since their last visit, from figures remembered in this browser.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonVictoryObjectiveView } from "../client-types.js";

const store = new Map<string, string>();
vi.mock("../client-state/client-storage.js", () => ({
  storageGet: (key: string): string | null => store.get(key) ?? null,
  storageSet: (key: string, value: string): void => { store.set(key, value); }
}));

const {
  RECORD_EVERY_MS, VISIT_GAP_MS, chronicleProgressForState, recordVisitProgress, chronicleProgressHtml, parseStoredVisitProgress,
  progressDeltas, progressSnapshot, resetVisitProgressForTests, rotateVisitProgress
} = await import("./client-hud-v2-chronicle-progress.js");

const path = (id: SeasonVictoryObjectiveView["id"], name: string, selfProgress: number | undefined, extra: Partial<SeasonVictoryObjectiveView> = {}): SeasonVictoryObjectiveView => ({
  id, name, description: "", leaderName: "Konrad", leaderPlayerId: "konrad", progressLabel: "", thresholdLabel: "", holdDurationSeconds: 86_400,
  statusLabel: "", conditionMet: false, progress: 0.8, ...(selfProgress === undefined ? {} : { selfProgress }), ...extra
});

describe("victory path progress since the last visit", () => {
  beforeEach(() => { store.clear(); resetVisitProgressForTests(); });

  it("snapshots the player's own share of each path, the leader's value when they lead", () => {
    const snap = progressSnapshot([path("MARITIME_SUPREMACY", "Maritime Supremacy", 0.31), path("TOWN_CONTROL", "Town Control", undefined), path("RESOURCE_MONOPOLY", "Resource Monopoly", 0.1, { leaderPlayerId: "me", progress: 0.6 })], "me", 5);
    expect(snap).toEqual({ at: 5, paths: { MARITIME_SUPREMACY: 0.31, RESOURCE_MONOPOLY: 0.6 } });
  });

  it("lists paths whose whole percent moved, biggest move first, capped at three", () => {
    const baseline = { at: 0, paths: { MARITIME_SUPREMACY: 0.31, TOWN_CONTROL: 0.5, RESOURCE_MONOPOLY: 0.2, DIPLOMATIC_DOMINANCE: 0.4, ECONOMIC_HEGEMONY: 0.1 } };
    const now = [
      path("MARITIME_SUPREMACY", "Maritime Supremacy", 0.36), path("TOWN_CONTROL", "Town Control", 0.502), path("RESOURCE_MONOPOLY", "Resource Monopoly", 0.1),
      path("DIPLOMATIC_DOMINANCE", "Diplomatic Dominance", 0.42), path("ECONOMIC_HEGEMONY", "Economic Hegemony", 0.5, { leaderPlayerId: "me", progress: 0.13 })
    ];
    expect(progressDeltas(baseline, now, "me")).toEqual([
      { id: "RESOURCE_MONOPOLY", name: "Resource Monopoly", beforePct: 20, nowPct: 10 },
      { id: "MARITIME_SUPREMACY", name: "Maritime Supremacy", beforePct: 31, nowPct: 36 },
      { id: "ECONOMIC_HEGEMONY", name: "Economic Hegemony", beforePct: 10, nowPct: 13 }
    ]);
    expect(progressDeltas(undefined, now, "me")).toEqual([]);
  });

  it("renders one button to Ranks, and nothing when no path moved", () => {
    expect(chronicleProgressHtml([])).toBe("");
    const html = chronicleProgressHtml([{ id: "MARITIME_SUPREMACY", name: "Maritime <b>", beforePct: 31, nowPct: 36 }, { id: "TOWN_CONTROL", name: "Town Control", beforePct: 50, nowPct: 44 }]);
    expect(html).toContain(`data-hud-v2-open="ranks"`);
    expect(html).toContain(`Maritime &lt;b&gt;</span><b class="v2c-gain">31% → 36%</b>`);
    expect(html).toContain(`<b class="v2c-loss">50% → 44%</b>`);
    expect(html).not.toMatch(/turn/i);
  });

  it("starts a new visit only after the gap, and empty for another contest or House", () => {
    const latest = { at: 1_000, paths: { TOWN_CONTROL: 0.2 } };
    const baseline = { at: 10, paths: { TOWN_CONTROL: 0.1 } };
    const stored = { key: "s1|me", baseline, latest };
    expect(rotateVisitProgress(stored, "s1|me", 1_000 + VISIT_GAP_MS)).toBe(stored);
    expect(rotateVisitProgress(stored, "s1|me", 1_001 + VISIT_GAP_MS)).toEqual({ key: "s1|me", baseline: latest, latest });
    expect(rotateVisitProgress(stored, "s2|me", 1_001 + VISIT_GAP_MS)).toEqual({ key: "s2|me" });
    expect(rotateVisitProgress(undefined, "s1|me", 5)).toEqual({ key: "s1|me" });
  });

  it("reads malformed storage as nothing remembered", () => {
    expect(parseStoredVisitProgress(null)).toBeUndefined();
    expect(parseStoredVisitProgress("{")).toBeUndefined();
    expect(parseStoredVisitProgress(`{"key":"k","latest":{"at":"x","paths":{}},"baseline":{"at":1,"paths":{"A":0.5}}}`)).toEqual({ key: "k", baseline: { at: 1, paths: { A: 0.5 } } });
  });

  it("compares with the end of the previous visit, however often the Chronicle is opened", () => {
    const state = { me: "me", bridgeDebugSeasonId: "s1", seasonVictory: [path("MARITIME_SUPREMACY", "Maritime Supremacy", 0.31)] };
    const hour = 3_600_000;
    // First visit: nothing to compare with, even after playing for an hour and moving the path.
    recordVisitProgress(state, 0);
    expect(chronicleProgressForState(state)).toEqual([]);
    state.seasonVictory = [path("MARITIME_SUPREMACY", "Maritime Supremacy", 0.33)];
    for (let t = RECORD_EVERY_MS; t <= hour; t += RECORD_EVERY_MS) recordVisitProgress(state, t);
    expect(chronicleProgressForState(state)).toEqual([]);

    // Away five hours (page closed): the path moved on from where the player left it, 33%, not from 31%.
    resetVisitProgressForTests();
    state.seasonVictory = [path("MARITIME_SUPREMACY", "Maritime Supremacy", 0.36)];
    recordVisitProgress(state, 6 * hour);
    const moved = [{ id: "MARITIME_SUPREMACY", name: "Maritime Supremacy", beforePct: 33, nowPct: 36 }];
    expect(chronicleProgressForState(state)).toEqual(moved);
    // Forty minutes into the same visit the comparison has not shifted to this visit's own start.
    for (let t = 6 * hour + RECORD_EVERY_MS; t <= 6 * hour + 40 * 60_000; t += RECORD_EVERY_MS) recordVisitProgress(state, t);
    expect(chronicleProgressForState(state)).toEqual(moved);
    // A reload mid-visit keeps it too.
    resetVisitProgressForTests();
    recordVisitProgress(state, 6 * hour + 41 * 60_000);
    expect(chronicleProgressForState(state)).toEqual(moved);
  });

  it("starts a new visit when the app was hidden past the gap, and records nothing while hidden", () => {
    const state = { me: "me", bridgeDebugSeasonId: "s1", seasonVictory: [path("TOWN_CONTROL", "Town Control", 0.2)] };
    recordVisitProgress(state, 0);
    state.seasonVictory = [path("TOWN_CONTROL", "Town Control", 0.5)];
    recordVisitProgress(state, 10 * 3_600_000, false);
    expect(chronicleProgressForState(state)).toEqual([]);
    recordVisitProgress(state, 10 * 3_600_000 + 1);
    expect(chronicleProgressForState(state)).toEqual([{ id: "TOWN_CONTROL", name: "Town Control", beforePct: 20, nowPct: 50 }]);
  });

  it("writes storage at most once a minute, never from an empty victory race, and keeps Houses apart", () => {
    const state = { me: "me", bridgeDebugSeasonId: "s1", seasonVictory: [path("TOWN_CONTROL", "Town Control", 0.2)] };
    recordVisitProgress({ ...state, seasonVictory: [] }, 0);
    expect(store.size).toBe(0);
    recordVisitProgress(state, 0);
    const saved = [...store.values()][0];
    recordVisitProgress({ ...state, seasonVictory: [path("TOWN_CONTROL", "Town Control", 0.9)] }, RECORD_EVERY_MS - 1);
    recordVisitProgress({ ...state, seasonVictory: [] }, 2 * RECORD_EVERY_MS);
    expect([...store.values()]).toEqual([saved]);
    // Another House on this browser gets its own record and no deltas from the first one.
    const other = { ...state, me: "other", seasonVictory: [path("TOWN_CONTROL", "Town Control", 0.05)] };
    recordVisitProgress(other, 10 * 3_600_000);
    expect(chronicleProgressForState(other)).toEqual([]);
    expect(store.size).toBe(2);
    expect([...store.values()][0]).toBe(saved);
  });

  // On a 375x667 phone the blocks above the list left it one row; progress scrolls with the list instead.
  it("places the block inside the scrolling list, after the unread results and before the day groups", async () => {
    const { chronicleHtml } = await import("./client-hud-v2-chronicle.js");
    const base = {
      me: "me", loading: false, error: undefined, rivalFilter: "", selectedId: undefined, nowMs: 10_000, awaySince: 500,
      nameOf: () => undefined, colorOf: () => undefined, techName: () => undefined,
      progress: [{ id: "TOWN_CONTROL", name: "Town Control", beforePct: 20, nowPct: 25 }],
      timeline: {
        playerId: "me", from: 0, to: 10_000, goldPlundered: 0, goldRaidedFromYou: 0, manpowerSpentAttacking: 0, truncated: false,
        summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 2 },
        cards: [
          { kind: "BUILDING_COMPLETED" as const, id: "new", occurredAt: 600, x: 1, y: 1, structureType: "FORT" },
          { kind: "BUILDING_COMPLETED" as const, id: "read", occurredAt: 400, x: 2, y: 2, structureType: "FORT" }
        ]
      }
    };
    const html = chronicleHtml(base);
    const at = (needle: string): number => html.indexOf(needle);
    expect(at("v2c-list")).toBeGreaterThan(-1);
    expect(at("v2c-list")).toBeLessThan(at("YOUR RESULTS SINCE YOU LAST LOOKED"));
    expect(at("YOUR RESULTS SINCE YOU LAST LOOKED")).toBeLessThan(at("v2c-progress"));
    expect(at("v2c-progress")).toBeLessThan(at(`data-v2-chronicle-show="read"`));
    // Not about a rival.
    expect(chronicleHtml({ ...base, rivalFilter: "kara" })).not.toContain("v2c-progress");
  });
});
