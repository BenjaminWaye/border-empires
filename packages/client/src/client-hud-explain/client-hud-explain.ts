// Tap-to-explain for the main-screen HUD words (owner decision, first-15 playtest 2026-11-28: "Integrity",
// "Dev", "Capacity / over cap", "sealed charges", "Victory race", "AFC", "Manifest" and "Chronicle" meant
// nothing to new players, and hover titles don't exist on a phone). One pattern everywhere: an element marked
// with hudExplainAttr(key) explains itself on its FIRST tap, as one plain line in a callout beside it with an
// Open button; after that its taps act as before. Each word is explained once per device (browser storage, with
// an in-memory fallback when storage is blocked). Lines stay terse: one line, no mechanic essays.

import { HOUSE_CHARGES_KEPT, MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import "./client-hud-explain.css";

const REFILL_HOURS = MANPOWER_REFILL_WINDOW_MS / 3_600_000;

export const HUD_EXPLAIN_LINES = {
  integrity: "Integrity: how compact your garrisoned land is · higher pays more coin and growth",
  dev: "Dev: garrisons and builds running at once, out of your slots",
  manpower: `Manpower: spent on every claim, garrison, build and attack · refills every ${REFILL_HOURS}h`,
  reserve: "Reserve: manpower above your capacity, yours to spend · refills resume below capacity",
  charges: `Sealed charges: secret goals from your House · keep ${HOUSE_CHARGES_KEPT} and hold them at season end`,
  victory: "Victory race: the ways to win this contest, and who is closest",
  manifest: "Manifest: research, paid in coin",
  towns: "Towns: food, growth and buildings for each town",
  afc: "AFC: your landing base · upgrades for coin",
  diplomacy: "Diplomacy: alliances and truces",
  ranks: "Ranks: the leaderboard and the victory race",
  chronicle: "Chronicle: what happened while you were away, and game updates"
} as const;

export type HudExplainKey = keyof typeof HUD_EXPLAIN_LINES;

const isKey = (key: string | undefined): key is HudExplainKey => key !== undefined && Object.prototype.hasOwnProperty.call(HUD_EXPLAIN_LINES, key);

/** The attribute that makes an element explain itself on its first tap. */
export const hudExplainAttr = (key: HudExplainKey): string => ` data-hud-explain="${key}"`;

const STORAGE_KEY = "be.hudExplainSeen.v1";
const seenInMemory = new Set<string>();

const readSeen = (): Set<string> => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) for (const key of parsed) if (typeof key === "string") seenInMemory.add(key);
  } catch {
    // Blocked or corrupt storage: what this session has seen still counts.
  }
  return seenInMemory;
};

export const hudExplainSeen = (key: HudExplainKey): boolean => readSeen().has(key);

const markSeen = (key: HudExplainKey): void => {
  const seen = readSeen();
  seen.add(key);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // Kept in memory for this session.
  }
};

/** Tests only: forget every word seen. */
export const resetHudExplainForTests = (): void => {
  seenInMemory.clear();
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
};

const CALLOUT_ID = "hud-explain-callout";
const CALLOUT_MS = 8_000;
const GUTTER_PX = 16;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
/** Closes the callout on a press anywhere else (the map included), installed while it shows. */
let outsidePress: ((event: Event) => void) | undefined;

export const hideHudExplain = (doc: Document = document): void => {
  if (hideTimer !== undefined) clearTimeout(hideTimer);
  hideTimer = undefined;
  if (outsidePress) doc.removeEventListener("pointerdown", outsidePress, true);
  outsidePress = undefined;
  doc.getElementById(CALLOUT_ID)?.remove();
};

/** Places the callout under the element (above it in the lower half of the screen), inside a 16px gutter. */
const place = (callout: HTMLElement, anchor: Element, doc: Document): void => {
  const view = doc.defaultView;
  const vw = view?.innerWidth ?? 0;
  const vh = view?.innerHeight ?? 0;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(callout.offsetWidth || 280, Math.max(0, vw - GUTTER_PX * 2));
  const left = Math.max(GUTTER_PX, Math.min(rect.left + rect.width / 2 - width / 2, vw - GUTTER_PX - width));
  callout.style.left = `${Math.round(left)}px`;
  if (rect.top > vh / 2) callout.style.bottom = `${Math.round(vh - rect.top + 8)}px`;
  else callout.style.top = `${Math.round(rect.bottom + 8)}px`;
};

const showCallout = (anchor: Element, key: HudExplainKey, doc: Document): void => {
  hideHudExplain(doc);
  const callout = doc.createElement("div");
  callout.id = CALLOUT_ID;
  callout.className = "hud-explain-callout";
  callout.setAttribute("role", "status");
  const text = doc.createElement("span");
  text.className = "hud-explain-text";
  text.textContent = HUD_EXPLAIN_LINES[key];
  const open = doc.createElement("button");
  open.type = "button";
  open.className = "hud-explain-open";
  open.textContent = "Open ›";
  callout.append(text, open);
  // Taps on the callout never reach the map under it.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"]) callout.addEventListener(type, (event) => event.stopPropagation());
  callout.addEventListener("click", (event) => {
    event.stopPropagation();
    hideHudExplain(doc);
    // The HUD rewrites its regions, so act on the element now on screen; the word is seen, so the tap goes through.
    if (event.target instanceof Element && event.target.closest(".hud-explain-open")) doc.querySelector<HTMLElement>(`[data-hud-explain="${key}"]`)?.click();
  });
  doc.body.append(callout);
  place(callout, anchor, doc);
  hideTimer = setTimeout(() => hideHudExplain(doc), CALLOUT_MS);
  // A press on another explained word is left to its own tap, which closes this callout and may open its own.
  outsidePress = (event) => {
    if (event.target instanceof Element && event.target.closest(`#${CALLOUT_ID}, [data-hud-explain]`)) return;
    hideHudExplain(doc);
  };
  doc.addEventListener("pointerdown", outsidePress, true);
};

/**
 * Call first in a tap handler. The first tap on an unexplained word shows its line and returns true: the caller
 * stops there. Any other tap closes an open callout and returns false, and the caller acts as usual.
 */
export const interceptHudExplainTap = (target: Element | null, doc: Document = document): boolean => {
  const el = target?.closest<HTMLElement>("[data-hud-explain]");
  const key = el?.dataset.hudExplain;
  if (!el || !isKey(key) || hudExplainSeen(key)) {
    hideHudExplain(doc);
    return false;
  }
  markSeen(key);
  showCallout(el, key, doc);
  return true;
};
