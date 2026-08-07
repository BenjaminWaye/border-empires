// §20 of the manpower-economy-rewrite plan: a persistent, scrollable
// "what happened while I was away" feed, distinct from the ephemeral
// PLAYER_MESSAGE toast. Vertical timeline, most-recent-first, one entry per
// event — generic over event type so future additions (monument first-part
// broadcasts, Ancient Ruins discoveries, tech completions, ...) need no
// changes here, only a new icon mapping.
export type ClientEventLogEntry = { id: string; type: string; text: string; occurredAt: number };

const ICON_BY_EVENT_TYPE: Record<string, string> = {
  TOWN_LOST: "🏚️",
  IMPERIAL_EXCHANGE_LEVY_HIT: "💰",
  IMPERIAL_EXCHANGE_LEVY_CAST: "🪙",
  MONUMENT_CLAIMED: "🏛️",
  MONUMENT_LOST_TO_RIVAL: "🥈",
  NATURAL_WONDER_CLAIMED: "✨"
};
const DEFAULT_EVENT_ICON = "•";

export const eventLogIconForType = (type: string): string => ICON_BY_EVENT_TYPE[type] ?? DEFAULT_EVENT_ICON;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatEventTimestamp = (occurredAt: number, nowMs: number): string => {
  const deltaMs = Math.max(0, nowMs - occurredAt);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const renderEventLogPanelHtml = (entries: readonly ClientEventLogEntry[], nowMs: number): string => {
  // Sort explicitly by occurredAt DESC rather than assuming the server's
  // array order (Array.prototype.sort is stable, so same-timestamp entries
  // keep their relative order). A blind .reverse() would silently corrupt
  // the display if the server's append order ever changed.
  const mostRecentFirst = [...entries].sort((a, b) => b.occurredAt - a.occurredAt);
  const rows = mostRecentFirst
    .map(
      (entry) => `<li class="event-log-row" data-event-type="${escapeHtml(entry.type)}">
        <span class="event-log-icon" aria-hidden="true">${eventLogIconForType(entry.type)}</span>
        <span class="event-log-text">${escapeHtml(entry.text)}</span>
        <span class="event-log-time">${formatEventTimestamp(entry.occurredAt, nowMs)}</span>
      </li>`
    )
    .join("");
  return `<article class="card event-log-card">
    <div class="event-log-head">
      <strong>Recent Events</strong>
    </div>
    ${
      mostRecentFirst.length > 0
        ? `<ul class="event-log-list">${rows}</ul>`
        : `<p class="event-log-empty">Nothing has happened yet — town captures and Imperial Exchange Levy hits will show up here.</p>`
    }
  </article>`;
};
