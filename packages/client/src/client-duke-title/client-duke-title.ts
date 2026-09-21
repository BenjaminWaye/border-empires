// Duke title: a player who currently owns a galaxy Planet -- a persistent,
// cross-season holding (see apps/realtime-gateway/src/galaxy-holdings and
// galaxy-senate-routes.ts's proposerHoldsPlanet precedent), NOT an in-match
// tile. Unlike the Founding Engineer tag (client-founding-engineer.ts),
// which is keyed on a hardcoded set of ids, Duke status is dynamic: callers
// pass in whether a given playerId currently holds a Planet (from
// ClientState.dukePlayers, populated from the server's per-player
// broadcast, or from a fetched GalaxyHoldingsView for the profile modal).
const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// Simplified crown mark (viewBox 0 0 48 48), sized down for inline use next
// to a name. currentColor lets callers tint it via CSS.
export const dukeTagHtml = (): string =>
  `<span class="duke-tag" title="Duke — owns a planet" aria-label="Duke — owns a planet">` +
  `<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">` +
  `<path d="M8 34 L10 16 L18 26 L24 12 L30 26 L38 16 L40 34 Z" />` +
  `<rect x="8" y="34" width="32" height="5" rx="1" />` +
  `<circle cx="10" cy="14" r="2.4" />` +
  `<circle cx="24" cy="10" r="2.4" />` +
  `<circle cx="38" cy="14" r="2.4" />` +
  `</svg></span>`;

// Wraps an already-escaped name span in the duke color class and appends
// the crown tag icon when isDuke is true. Callers own escaping the name
// themselves since they already have their own escapeHtml helpers.
export const dukeNameHtml = (escapedName: string, isDuke: boolean): string => {
  if (!isDuke) return escapedName;
  return `<span class="duke-name">${escapedName}</span>${dukeTagHtml()}`;
};

// True when the given holdings view shows at least one currently-held
// Planet (Outposts alone don't qualify -- matches the server's
// holdsPlanetTier / proposerHoldsPlanet precedent). Used by the player
// profile modal, which already fetches a single player's GalaxyHoldingsView.
export const isDukeFromHoldings = (holdings: { planets: readonly unknown[] } | undefined): boolean =>
  Boolean(holdings && holdings.planets.length > 0);
