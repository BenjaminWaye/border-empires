// In-world quotes shown under the map-loading overlay while a player waits to
// get into the game. Every line is either quoted verbatim from canon
// (docs/lore/duke-memoir.md, the Writ of Sectors in docs/lore/galactic-lore.md
// §2) or a short frontier saying that restates established canon (§3-§5) and
// adds no new fact. The memoir quotes are checked against the memoir text in
// the test beside this file, so editing the memoir can't silently drift them.
import type { MapLoadingView } from "../client-map-loading-view/client-map-loading-view.js";

export type LoginLoreQuote = {
  text: string;
  source: string;
};

const SABLE = "Duke Alvra Sable, The Sable Recollections";

export const LOGIN_LORE_QUOTES: readonly LoginLoreQuote[] = [
  { text: "To hold nothing is to owe everything.", source: "The Writ of Sectors" },
  { text: "Unclaimed ground is a debt the galaxy owes itself.", source: "The Writ of Sectors" },
  { text: "Because whatever's still hungry out here already ate it.", source: "A frontier town elder, to Alvra Sable" },
  { text: "I did not understand, that day, that a Duke's debts are never called paid. Only refinanced.", source: SABLE },
  { text: "The Bleed does not hate you.", source: SABLE },
  { text: "The Court noticed before I did. That is, I have come to believe, always true.", source: SABLE },
  { text: "I was running a shipping concern that had grown teeth.", source: SABLE },
  { text: "Calling it a game and understanding what it actually was were two different things.", source: SABLE },
  { text: "Crystal is aether that has gone quiet. Refining it wakes it up.", source: "Frontier saying" },
  { text: "The frontier doesn't care who you are. It cares what you're doing.", source: "Frontier saying" },
  { text: "Build more, and the frontier pushes back harder.", source: "Frontier saying" },
  { text: "The Wardens were built to destroy the infestations. They could not tell them from their makers.", source: "Court histories" }
];

// Same seed, same quote.
export const pickLoginLoreQuote = (seed: number): LoginLoreQuote => {
  const count = LOGIN_LORE_QUOTES.length;
  const index = Number.isFinite(seed) ? ((Math.floor(Math.abs(seed)) % count) + count) % count : 0;
  return LOGIN_LORE_QUOTES[index] ?? LOGIN_LORE_QUOTES[0]!;
};

// Only a calm wait gets a quote. A warning or a recovery button needs the
// player's full attention, so the quote steps aside.
export const loginLoreQuoteForView = (
  view: Pick<MapLoadingView, "tone" | "showRetry" | "showReload" | "showDiagnostics">,
  seed: number
): LoginLoreQuote | null => {
  if (view.tone !== "normal" || view.showRetry || view.showReload || view.showDiagnostics) return null;
  return pickLoginLoreQuote(seed);
};

// One quote per page load. The overlay re-renders every frame, and the
// client resets mapLoadStartedAt several times during a single login (socket
// open, init, auth retry), so seeding from that would swap the quote while
// the player is reading it.
let pageQuoteSeed: number | null = null;
const pageLoginLoreQuoteSeed = (): number => {
  pageQuoteSeed ??= Date.now();
  return pageQuoteSeed;
};

type MapLoadingCopyElements = {
  mapLoadingOverlayEl: HTMLElement;
  mapLoadingTitleEl: HTMLElement;
  mapLoadingMetaEl: HTMLElement;
};

export const renderMapLoadingCopy = (dom: MapLoadingCopyElements, view: MapLoadingView, seed: number = pageLoginLoreQuoteSeed()): void => {
  dom.mapLoadingTitleEl.textContent = view.title;
  dom.mapLoadingMetaEl.textContent = view.meta;
  const quoteEl = dom.mapLoadingOverlayEl.querySelector<HTMLElement>("#map-loading-quote");
  if (!quoteEl) return;
  const quote = loginLoreQuoteForView(view, seed);
  quoteEl.hidden = quote === null;
  if (!quote) return;
  const textEl = quoteEl.querySelector<HTMLElement>("#map-loading-quote-text");
  const sourceEl = quoteEl.querySelector<HTMLElement>("#map-loading-quote-source");
  if (textEl && textEl.textContent !== quote.text) textEl.textContent = quote.text;
  if (sourceEl && sourceEl.textContent !== quote.source) sourceEl.textContent = quote.source;
};
