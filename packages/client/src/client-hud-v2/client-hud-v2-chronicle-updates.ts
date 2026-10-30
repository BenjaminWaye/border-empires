// Chronicle's Updates tab: release notes as a compact list in the drawer's own
// style. One line per release, grouped by day, unread ones marked; a release
// opens in place to show what changed. The newest unread one opens by default.

import { sortedClientChangelogEntries, unseenClientChangelogEntries, type ClientChangelogEntry } from "../client-changelog/client-changelog.js";
import { dayHeading } from "./client-hud-v2-chronicle.js";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const RECENT_WHEN_ALL_READ = 10;

/** `undefined` opens the newest unread release; `null` means the player closed them all. */
export type OpenUpdate = string | null | undefined;

/** Several releases share a createdAt, so a row is keyed by its time and title together. */
export const updateKey = (entry: Pick<ClientChangelogEntry, "createdAt" | "title">): string => `${entry.createdAt}|${entry.title}`;

const rowHtml = (entry: ClientChangelogEntry, unread: boolean, open: boolean): string => {
  const head = `<button type="button" class="v2u-row${unread ? " v2u-new" : ""}${open ? " v2u-open" : ""}" aria-expanded="${open}" data-v2-update="${esc(updateKey(entry))}">
    <span class="v2u-dot" aria-hidden="true"></span><span class="v2u-title">${esc(entry.title)}</span><span class="v2u-caret" aria-hidden="true">${open ? "▾" : "▸"}</span>
  </button>`;
  if (!open) return head;
  return `${head}<ul class="v2u-changes">${entry.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
};

/** Unseen release notes, or the recent ten when everything has been read. `baselineSeenAt` pins the list while the tab is open. */
export const updatesTabHtml = (baselineSeenAt: number, openUpdate: OpenUpdate = undefined, nowMs: number = Date.now()): string => {
  const unseen = unseenClientChangelogEntries(baselineSeenAt);
  const entries = unseen.length > 0 ? unseen : sortedClientChangelogEntries().slice(0, RECENT_WHEN_ALL_READ);
  if (entries.length === 0) return `<div class="v2s-empty">No release notes yet</div>`;
  const unread = new Set(unseen.map(updateKey));
  const newest = unseen[0];
  const openId = openUpdate === undefined ? (newest ? updateKey(newest) : undefined) : openUpdate;
  let html = "";
  let lastHeading = "";
  for (const entry of entries) {
    const heading = dayHeading(entry.createdAt, nowMs);
    if (heading !== lastHeading) html += `<div class="v2c-day">${heading}</div>`;
    lastHeading = heading;
    html += rowHtml(entry, unread.has(updateKey(entry)), updateKey(entry) === openId);
  }
  return `<div class="v2c-list v2u-list" data-v2-scroll="chronicle-updates">${html}</div>`;
};

/** The release a click toggles: opens it, or closes it when it was the open one. */
export const toggledUpdate = (current: OpenUpdate, newestUnreadId: string | undefined, clicked: string): OpenUpdate => {
  const openId = current === undefined ? newestUnreadId : current;
  return openId === clicked ? null : clicked;
};
