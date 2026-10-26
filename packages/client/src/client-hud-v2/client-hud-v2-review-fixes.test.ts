// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { SeasonVictoryObjectiveView } from "../client-types.js";
import { diplomacyStanceLookup } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";
import { battleOutcomeFromAlert } from "./client-hud-v2-battle-runtime.js";
import { escapeOpensSettings } from "./client-hud-v2-escape.js";
import { readHudV2Flag } from "./client-hud-v2-flag.js";
import { selfShare } from "./client-hud-v2-ranks.js";

describe("Esc opens Settings only when nothing else wants it", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens Settings on an idle map", () => {
    expect(escapeOpensSettings(createInitialState(), document)).toBe(true);
  });

  it("stays out of the way of crystal targeting, garrison-many and photo mode", () => {
    for (const mutate of [
      (s: ReturnType<typeof createInitialState>) => { s.crystalTargeting.active = true; },
      (s: ReturnType<typeof createInitialState>) => { s.garrisonMany.active = true; },
      (s: ReturnType<typeof createInitialState>) => { s.photoModeActive = true; }
    ]) {
      const state = createInitialState();
      mutate(state);
      expect(escapeOpensSettings(state, document)).toBe(false);
    }
  });

  it("stays out of the way of an open dialog", () => {
    document.body.innerHTML = `<div role="dialog" style="width:10px;height:10px">Ruins</div>`;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
    dialog.getClientRects = () => [{ x: 0, y: 0, width: 10, height: 10 }] as unknown as DOMRectList;
    expect(escapeOpensSettings(createInitialState(), document)).toBe(false);
  });
});

describe("battle outcome", () => {
  const alert = (tone: "success" | "error" | "warn", until = Date.now() + 10_000) => ({ title: tone === "success" ? "Territory captured" : "Attack failed", detail: "d", until, tone, manpowerLoss: 40 });

  it("ignores the alert that was already on screen when the fight started", () => {
    const before = alert("error");
    expect(battleOutcomeFromAlert(before, before, Date.now())).toBeUndefined();
  });

  it("reports a new result alert as the outcome, in its own words", () => {
    expect(battleOutcomeFromAlert(alert("success"), undefined, Date.now())).toMatchObject({ won: true, headline: "Territory captured", manpowerLoss: 40 });
    expect(battleOutcomeFromAlert(alert("warn"), undefined, Date.now())).toMatchObject({ won: false, headline: "Attack failed" });
  });

  it("claims no outcome when the capture cleared with no result (cancel, resync, timeout)", () => {
    expect(battleOutcomeFromAlert(undefined, undefined, Date.now())).toBeUndefined();
    expect(battleOutcomeFromAlert(alert("success", Date.now() - 1), undefined, Date.now())).toBeUndefined();
  });
});

describe("review fixes: Ranks, overlay and flag", () => {
  const econ = (over: Partial<SeasonVictoryObjectiveView>): SeasonVictoryObjectiveView => ({
    id: "ECONOMIC_HEGEMONY", name: "Economic Ascendancy", description: "", leaderName: "Ash", leaderPlayerId: "ash",
    progressLabel: "", thresholdLabel: "", holdDurationSeconds: 86_400, statusLabel: "", conditionMet: false, ...over
  });

  it("never draws you ahead of the top earner on Economic Hegemony", () => {
    expect(selfShare(econ({ progress: 0.3, selfProgress: 0.9 }), "me")).toBeCloseTo(0.27);
    expect(selfShare(econ({ selfProgress: 0.9 }), "me")).toBeUndefined();
  });

  it("treats every barbarian id as barbarian", () => {
    const stanceOf = diplomacyStanceLookup({ me: "me", allies: [], activeTruces: [] });
    expect([stanceOf("barbarian"), stanceOf("barbarian-1")]).toEqual(["barbarian", "barbarian"]);
  });

  it("honours ?hud=v2 when storage is unavailable", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => undefined };
    expect(readHudV2Flag("?hud=v2", blocked)).toBe(true);
    expect(readHudV2Flag("", blocked)).toBe(false);
  });
});
