// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { notifyCombatResult } from "../client-network/client-combat-result-notifications.js";
import { tileActionMenuHtml } from "../client-tile-menu-html.js";
import type { TileMenuView } from "../client-types.js";
import { injectMusterCombatReports, musterReportsHtml, wireMusterReports } from "./client-muster-combat-reports-ui.js";
import { markMusterReportsRead, musterCombatReports, musterReportDiagnostics, musterReportFlagKey, recordMusterCombatReport, trackMusterReportStart } from "./client-muster-combat-reports.js";

const alert = { title: "Victory", detail: "Town conquered. Lost 120 manpower.", tone: "success" as const, manpowerLoss: 120 };
const stateFor = () => { const state = createInitialState(); state.me = "me"; state.joinSeasonId = "season-1"; return state; };
const result = (id: string, x = 3) => ({ commandId: `territory-auto:muster-advance:${id}`, target: { x: x + 1, y: 3 }, origin: { x, y: 3 }, attackerWon: true, manpowerDelta: -120, pillagedGold: 350 });
const viewFor = (): TileMenuView => ({ title: "Muster flag", subtitle: "Your frontier", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] });
beforeEach(() => { localStorage.clear(); document.body.innerHTML = ""; });

describe("muster combat history", () => {
  it("routes four simultaneous results to their flags without opening capture overlays", () => {
    const state = stateFor();
    const showCaptureAlert = vi.fn();
    const appendFeedEntry = vi.fn();
    for (let x = 1; x <= 4; x++) {
      const msg = result(`battle-${x}`, x);
      trackMusterReportStart(state, { ...msg, musterOrigin: { x: x + 10, y: 8 } });
      notifyCombatResult(state, msg, { targetTileBefore: undefined, originTileBefore: undefined }, musterReportFlagKey(state, msg), {
        keyFor: (tx, ty) => `${tx},${ty}`, combatResolutionAlert: () => alert,
        wasPredictedCombatAlreadyShown: () => false, appendFeedEntry, showCaptureAlert
      });
      expect(musterCombatReports(state, `${x + 10},8`)).toHaveLength(1);
    }
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(appendFeedEntry).toHaveBeenCalledTimes(4);
  });
  it("keeps normal manually dispatched result notifications", () => {
    const state = stateFor(); const showCaptureAlert = vi.fn();
    const msg = { ...result("manual"), commandId: "manual-attack" };
    notifyCombatResult(state, msg, { targetTileBefore: undefined, originTileBefore: undefined }, musterReportFlagKey(state, msg), {
      keyFor: (x, y) => `${x},${y}`, combatResolutionAlert: () => alert,
      wasPredictedCombatAlreadyShown: () => false, appendFeedEntry: vi.fn(), showCaptureAlert
    });
    expect(showCaptureAlert).toHaveBeenCalledOnce();
  });
  it("deduplicates replayed results and restores unread state on reload", () => {
    const state = stateFor();
    recordMusterCombatReport(state, result("one"), "3,3", alert);
    recordMusterCombatReport(state, result("one"), "3,3", alert);
    expect(musterCombatReports(state, "3,3")).toHaveLength(1);
    const restored = stateFor();
    expect(musterCombatReports(restored, "3,3")[0]).toMatchObject({ manpowerDelta: -120, coins: 350, read: false });
    markMusterReportsRead(restored, [result("one").commandId]);
    expect(musterCombatReports(stateFor(), "3,3")[0]?.read).toBe(true);
  });
  it("isolates players and seasons, including in-place rollover", () => {
    const state = stateFor(); recordMusterCombatReport(state, result("one"), "3,3", alert);
    const other = stateFor(); other.me = "another-player";
    expect(musterCombatReports(other, "3,3")).toEqual([]);
    state.joinSeasonId = "season-2";
    expect(musterCombatReports(state, "3,3")).toEqual([]);
  });
  it("bounds histories and pending provenance directly", () => {
    const state = stateFor();
    for (let i = 0; i < 80; i++) recordMusterCombatReport(state, result(`${i}`), "3,3", alert);
    expect(musterCombatReports(state, "3,3")).toHaveLength(40);
    for (let x = 10; x < 20; x++) for (let i = 0; i < 40; i++) recordMusterCombatReport(state, result(`${x}-${i}`, x), `${x},3`, alert);
    for (let i = 0; i < 80; i++) trackMusterReportStart(state, result(`pending-${i}`));
    expect(musterReportDiagnostics(state)).toMatchObject({ reports: 200, pending: 64 });
    expect(musterReportDiagnostics(state).evictions).toBeGreaterThan(0);
  });
  it("survives storage failures and rejects malformed stored reports", () => {
    localStorage.setItem("border-empires:muster-combat-reports:v1", JSON.stringify({ scope: "me:season-1", reports: [{ id: "broken" }] }));
    const state = stateFor(); expect(musterCombatReports(state, "3,3")).toEqual([]);
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => recordMusterCombatReport(state, result("one"), "3,3", alert)).not.toThrow();
    expect(musterCombatReports(state, "3,3")).toHaveLength(1); write.mockRestore();
  });
  it("shows unread counts, signed red losses and green loot and marks only displayed reports read", () => {
    const state = stateFor(); recordMusterCombatReport(state, result("one"), "3,3", alert);
    const view = viewFor();
    injectMusterCombatReports(view, { x: 3, y: 3, terrain: "LAND", fogged: false, muster: { ownerId: "me", amount: 60, mode: "HOLD", updatedAt: 0 } }, state);
    document.body.innerHTML = tileActionMenuHtml(view, "reports", false);
    expect(document.body.textContent).toContain("Recent combat");
    expect(document.querySelector('.muster-reports-tab-badge')?.textContent).toBe("1");
    expect(document.querySelector('.muster-report-loss')?.textContent).toBe("−120 manpower lost");
    expect(document.querySelector('.muster-report-gain')?.textContent).toBe("+350 coins plundered");
    const rerender = vi.fn(); wireMusterReports(document.body, state, view.musterReports, rerender);
    recordMusterCombatReport(state, result("two"), "3,3", alert);
    document.querySelector<HTMLButtonElement>('[data-muster-reports-read]')?.click();
    expect(musterCombatReports(state, "3,3").map((report) => report.read)).toEqual([false, true]);
    expect(rerender).toHaveBeenCalledOnce();
  });
  it("escapes report detail and gives new flags a useful empty state", () => {
    const state = stateFor(); recordMusterCombatReport(state, result("one"), "3,3", { ...alert, detail: '<img src=x onerror=alert(1)>' });
    const html = musterReportsHtml({ flagKey: "3,3", reports: musterCombatReports(state, "3,3"), unread: 1 });
    expect(html).not.toContain('<img'); expect(html).toContain('&lt;img');
    expect(musterReportsHtml(undefined)).toContain("No combat reports yet");
  });
});
