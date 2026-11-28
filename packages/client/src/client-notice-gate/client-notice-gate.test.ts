// @vitest-environment happy-dom
// First-15 playtest (2026-11-28, 8 of 15 players): pop-ups stacked and took the next tap. Town Captured slid
// over the open House Charges panel and swallowed an Explore tap; the charges note popped up over a confirm
// sheet. Unprompted notices now wait for open sheets and modals, and for a quiet moment after a tap.
import { readFileSync } from "node:fs";
import { URL as NodeUrl } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTICE_QUIET_MS, noteNoticeGatePress, noticeModalOpen, noticePressRecent, noticesHeld, resetNoticeGateForTests } from "./client-notice-gate.js";
import {
  FULLSCREEN_CARD_ARRIVAL_GUARD_MS,
  FULLSCREEN_CARD_HOLD_RETRY_MS,
  dropsArrivalTap,
  activeFullscreenCard,
  enqueueFullscreenCard,
  resetFullscreenCardQueueForTests,
  setFullscreenCardHold,
  tryClaimFullscreenCard
} from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";

const enqueueCard = (onAction: () => void): void =>
  enqueueFullscreenCard({
    key: "town-capture",
    show: () => {
      const card = document.createElement("div");
      card.id = "town-capture-overlay";
      card.innerHTML = `<button type="button" id="garrison-now">Garrison now</button>`;
      card.querySelector("button")!.addEventListener("click", onAction);
      document.body.appendChild(card);
      return card;
    }
  });

beforeEach(() => {
  document.body.className = "";
  document.body.innerHTML = `<aside id="side-panel" style="display:none"></aside>`;
  resetNoticeGateForTests();
  resetFullscreenCardQueueForTests();
});
afterEach(() => {
  vi.useRealTimers();
  resetFullscreenCardQueueForTests();
});

describe("notice gate", () => {
  it("is open while only the map shows", () => {
    expect(noticeModalOpen(document)).toBe(false);
    expect(noticesHeld(document, 1_000_000)).toBe(false);
  });

  it.each([
    ["a HUD panel (House Charges)", () => { document.getElementById("side-panel")!.style.display = "grid"; }],
    ["a confirm sheet (Change empire?)", () => { document.body.insertAdjacentHTML("beforeend", `<div class="break-pact-overlay"></div>`); }],
    ["a full HUD screen", () => { document.body.classList.add("hud-v2-screen-open"); }],
    ["a deal draft", () => { document.body.insertAdjacentHTML("beforeend", `<div class="diplomacy-trade-overlay"></div>`); }],
    ["an opened tip card", () => { document.body.insertAdjacentHTML("beforeend", `<div id="discovery-tip-overlay"></div>`); }]
  ])("holds notices while %s is open", (_name, open) => {
    open();
    expect(noticeModalOpen(document)).toBe(true);
  });

  it("holds notices during a press and for a quiet moment after it", () => {
    noteNoticeGatePress(true, 1_000);
    expect(noticePressRecent(50_000)).toBe(true);
    noteNoticeGatePress(false, 1_200);
    expect(noticePressRecent(1_200 + NOTICE_QUIET_MS - 1)).toBe(true);
    expect(noticePressRecent(1_200 + NOTICE_QUIET_MS)).toBe(false);
  });
});

describe("full-screen cards wait for the notice gate", () => {
  it("does not slide Town Captured over the open House Charges panel; it shows once the panel closes", () => {
    vi.useFakeTimers();
    setFullscreenCardHold(() => noticesHeld(document, Date.now()));
    const panel = document.getElementById("side-panel")!;
    panel.style.display = "grid";
    enqueueCard(() => {});
    expect(document.getElementById("town-capture-overlay")).toBeNull();
    expect(activeFullscreenCard()).toBeUndefined();
    panel.style.display = "none";
    vi.advanceTimersByTime(FULLSCREEN_CARD_HOLD_RETRY_MS);
    expect(document.getElementById("town-capture-overlay")).not.toBeNull();
    expect(activeFullscreenCard()).toBe("town-capture");
  });

  it("does not land under a tap in progress", () => {
    vi.useFakeTimers();
    setFullscreenCardHold(() => noticesHeld(document, Date.now()));
    noteNoticeGatePress(true, Date.now());
    enqueueCard(() => {});
    vi.advanceTimersByTime(FULLSCREEN_CARD_HOLD_RETRY_MS * 4);
    expect(document.getElementById("town-capture-overlay")).toBeNull();
    noteNoticeGatePress(false, Date.now());
    vi.advanceTimersByTime(NOTICE_QUIET_MS + FULLSCREEN_CARD_HOLD_RETRY_MS);
    expect(document.getElementById("town-capture-overlay")).not.toBeNull();
  });

  it("keeps a self-managed card (the survey popup) from claiming the slot while held", () => {
    setFullscreenCardHold(() => true);
    expect(tryClaimFullscreenCard("occupation-survey", document.createElement("div"))).toBeUndefined();
  });

  it("drops a real tap on a card that has only just appeared: it was meant for what was under it", () => {
    expect(dropsArrivalTap(true, 1_000, 1_000)).toBe(true);
    expect(dropsArrivalTap(true, 1_000 + FULLSCREEN_CARD_ARRIVAL_GUARD_MS - 1, 1_000)).toBe(true);
    expect(dropsArrivalTap(true, 1_000 + FULLSCREEN_CARD_ARRIVAL_GUARD_MS, 1_000)).toBe(false);
    expect(dropsArrivalTap(false, 1_000, 1_000)).toBe(false);
  });

  it("lets a scripted click (keyboard, tests) through at once", () => {
    const garrison = vi.fn();
    enqueueCard(garrison);
    document.getElementById("garrison-now")!.click(); // scripted: not dropped
    expect(garrison).toHaveBeenCalledTimes(1);
  });

  it("is installed at start-up", () => {
    const source = readFileSync(new NodeUrl("../client-post-bootstrap-installs/client-post-bootstrap-installs.ts", import.meta.url), "utf8");
    expect(source).toContain("installNoticeGate();");
    const gate = readFileSync(new NodeUrl("./client-notice-gate.ts", import.meta.url), "utf8");
    expect(gate).toContain("setFullscreenCardHold(() => noticesHeld(document, Date.now()));");
  });
});
