// Founding Engineer tag: a cosmetic marker for a short hardcoded list of
// early contributors, shown next to their display name in the lobby, tile
// detail view, and leaderboard. There's no player-account/role system in
// this codebase to hang a real flag off of, so this matches on display name
// (case-insensitive) -- the same tradeoff the rest of the client already
// makes by treating display names as the de facto player identity in most
// UI (see client-owner-name.ts).
const FOUNDING_ENGINEER_NAMES: ReadonlySet<string> = new Set(["konradsdelikatesskörv"]);

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export const isFoundingEngineerName = (name: string | undefined): boolean => Boolean(name && FOUNDING_ENGINEER_NAMES.has(name.trim().toLowerCase()));

// Simplified top-hat mark (viewBox 0 0 48 48), sized down for inline use next
// to a name. currentColor lets callers tint it via CSS.
export const foundingEngineerTagHtml = (): string =>
  `<span class="founding-engineer-tag" title="Founding Engineer" aria-label="Founding Engineer">` +
  `<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">` +
  `<rect x="10" y="34" width="28" height="4" rx="1" />` +
  `<path d="M14 34 L14 12 Q14 8 18 8 L30 8 Q34 8 34 12 L34 34 Z" />` +
  `<rect x="14" y="24" width="20" height="4" fill="#7D231B" />` +
  `<circle cx="20" cy="20" r="3" fill="none" stroke="#E5D0A3" stroke-width="1.2" />` +
  `<circle cx="28" cy="20" r="3" fill="none" stroke="#E5D0A3" stroke-width="1.2" />` +
  `<line x1="23" y1="20" x2="25" y2="20" stroke="#E5D0A3" stroke-width="1" />` +
  `</svg></span>`;

// Wraps an already-escaped name span in the founding-engineer color class
// and appends the tag icon when the name matches. Callers own escaping the
// name themselves since they already have their own escapeHtml helpers.
export const foundingEngineerNameHtml = (escapedName: string, rawName: string | undefined): string => {
  if (!isFoundingEngineerName(rawName)) return escapedName;
  return `<span class="founding-engineer-name">${escapedName}</span>${foundingEngineerTagHtml()}`;
};

// Owner-label span for the tile detail subtitle: ally styling and the
// founding-engineer tag are independent, so either or both can apply. Takes
// the raw (unescaped) label -- unlike foundingEngineerNameHtml, this one
// owns escaping itself since its caller has no escapeHtml of its own.
export const tileOwnerLabelHtml = (ownerLabel: string, ownerName: string | undefined, isAlly: boolean): string =>
  `<span class="tile-owner-label${isAlly ? " is-ally" : ""}">${foundingEngineerNameHtml(escapeHtml(ownerLabel), ownerName)}</span>`;
