// Chronicle's Lore tab: the lore catalogue (client-lore-catalogue) as an
// accordion in the Updates tab's style, grouped by heading. One entry opens at
// a time; a "?" elsewhere in the game opens the Chronicle here on its entry.

import { LORE_ENTRIES, LORE_GROUPS, type LoreEntry } from "../client-lore-catalogue/lore-catalogue-entries.js";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const rowHtml = (entry: LoreEntry, open: boolean): string => {
  const head = `<button type="button" class="v2u-row${open ? " v2u-open" : ""}" aria-expanded="${open}" data-v2-lore="${esc(entry.id)}">
    <span class="v2u-dot" aria-hidden="true"></span><span class="v2u-title">${esc(entry.title)}</span><span class="v2u-caret" aria-hidden="true">${open ? "▾" : "▸"}</span>
  </button>`;
  if (!open) return head;
  return `${head}<div class="v2l-body">${entry.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
};

/** Every entry under its group heading; `openId` is the one shown open. */
export const loreTabHtml = (openId: string | undefined): string => {
  let html = "";
  for (const group of LORE_GROUPS) {
    const entries = LORE_ENTRIES.filter((entry) => entry.group === group);
    if (entries.length === 0) continue;
    html += `<div class="v2c-day">${esc(group)}</div>${entries.map((entry) => rowHtml(entry, entry.id === openId)).join("")}`;
  }
  return `<div class="v2c-list v2u-list" data-v2-scroll="chronicle-lore">${html}</div>`;
};

/** The entry a click toggles: opens it, or closes it when it was the open one. */
export const toggledLoreEntry = (current: string | undefined, clicked: string): string | undefined =>
  current === clicked ? undefined : clicked;
