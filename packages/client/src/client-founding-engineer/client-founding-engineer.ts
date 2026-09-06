// Founding Engineer tag: a cosmetic marker for a short hardcoded list of
// early contributors, shown next to their name in the lobby, tile detail
// view, and leaderboard. Keyed on the player's stable id (a Firebase uid,
// resolved once via the prod player_profiles table) rather than display
// name: display names are user-editable per-season labels (see
// client-owner-name.ts), so matching on name would drop the tag if this
// player renames, or hand it to anyone else who renamed to the same string.
const FOUNDING_ENGINEER_PLAYER_IDS: ReadonlySet<string> = new Set(["VK5iriJAhickNf9ArrRweUDnq1W2"]);

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export const isFoundingEngineerPlayerId = (playerId: string | undefined): boolean =>
  Boolean(playerId && FOUNDING_ENGINEER_PLAYER_IDS.has(playerId));

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
// and appends the tag icon when playerId matches. Callers own escaping the
// name themselves since they already have their own escapeHtml helpers.
export const foundingEngineerNameHtml = (escapedName: string, playerId: string | undefined): string => {
  if (!isFoundingEngineerPlayerId(playerId)) return escapedName;
  return `<span class="founding-engineer-name">${escapedName}</span>${foundingEngineerTagHtml()}`;
};

// Owner-label span for the tile detail subtitle: ally styling and the
// founding-engineer tag are independent, so either or both can apply. Takes
// the raw (unescaped) label -- unlike foundingEngineerNameHtml, this one
// owns escaping itself since its caller has no escapeHtml of its own.
// Clickable via data-player-name-id (wired up by wirePlayerProfileOverlay,
// the same attribute the leaderboard's playerNameBadgeHtml uses) whenever a
// real foreign owner is behind the label -- an unclaimed/sea/self label has
// no ownerId and stays plain text.
export const tileOwnerLabelHtml = (ownerLabel: string, ownerId: string | undefined, isAlly: boolean): string =>
  `<span class="tile-owner-label${isAlly ? " is-ally" : ""}"${ownerId ? ` data-player-name-id="${escapeHtml(ownerId)}"` : ""}>${foundingEngineerNameHtml(escapeHtml(ownerLabel), ownerId)}</span>`;
