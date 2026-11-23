// In-world quotes shown under the map-loading overlay while a player waits to
// get into the game. Every line is either quoted verbatim from canon
// (docs/lore/duke-memoir.md, the Writ of Sectors in docs/lore/galactic-lore.md
// §2) or a short in-world line (a saying, an order, a herald's call) that
// restates established canon (§2-§5) and adds no new fact. The memoir quotes
// are checked against the memoir text in the test beside this file, so
// editing the memoir can't silently drift them.
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
  { text: "The Court noticed before I did. That is, I have come to believe, always true.", source: SABLE },
  { text: "A camp that is watched wakes.", source: SABLE },
  { text: "The Court had cleared the world for us. Nobody had asked the world.", source: SABLE },
  { text: "I had lit a lamp in a dark room full of people holding knives.", source: SABLE },
  { text: "I have heard Dukes say they had no choice. I had a choice. I could have lost.", source: SABLE },
  { text: "A Writ is never forced. That is the cruelty of it.", source: SABLE },
  { text: "The Wardens do not hate you.", source: SABLE },
  { text: "Crystal is aether that has gone quiet. Refining it puts it back to work.", source: "Frontier saying" },
  { text: "The Court forgot us for generations. Now it sends Houses.", source: "Frontier saying" },
  { text: "The Wardens burned away the Bleed. Then they could not tell it from their makers.", source: "Court histories" },
  { text: "We were not relieved. We were not surrendered. So we are still on duty.", source: "Planetary Defense camp order" },
  { text: "A Sector is proclaimed. Let the Houses that would hold it commit.", source: "Court herald, opening a Sector Contest" },
  { text: "The Senate may vote an embargo. It has been told that is enough.", source: "Senate saying" }
];

// Same seed, same quote.
export const pickLoginLoreQuote = (seed: number): LoginLoreQuote => {
  const count = LOGIN_LORE_QUOTES.length;
  const index = Number.isFinite(seed) ? ((Math.floor(Math.abs(seed)) % count) + count) % count : 0;
  return LOGIN_LORE_QUOTES[index] ?? LOGIN_LORE_QUOTES[0]!;
};

// One quote per page load. The overlay re-renders every frame, and the
// client resets mapLoadStartedAt several times during a single login (socket
// open, init, auth retry), so seeding from that would swap the quote while
// the player is reading it.
let pageQuoteSeed: number | null = null;
export const pageLoginLoreQuoteSeed = (): number => {
  pageQuoteSeed ??= Date.now();
  return pageQuoteSeed;
};

type MapLoadingCopyElements = {
  mapLoadingOverlayEl: HTMLElement;
  mapLoadingTitleEl: HTMLElement;
  mapLoadingMetaEl: HTMLElement;
};

// Fills a <figure> holding a <blockquote> and a <figcaption>, or hides it.
// Shared by the sign-in loading card and the in-game map-loading overlay.
export const renderLoreQuoteFigure = (figureEl: HTMLElement, quote: LoginLoreQuote | null): void => {
  figureEl.hidden = quote === null;
  if (!quote) return;
  const textEl = figureEl.querySelector<HTMLElement>("blockquote");
  const sourceEl = figureEl.querySelector<HTMLElement>("figcaption");
  if (textEl && textEl.textContent !== quote.text) textEl.textContent = quote.text;
  if (sourceEl && sourceEl.textContent !== quote.source) sourceEl.textContent = quote.source;
};

export const renderMapLoadingCopy = (dom: MapLoadingCopyElements, view: MapLoadingView, seed: number = pageLoginLoreQuoteSeed()): void => {
  dom.mapLoadingTitleEl.textContent = view.title;
  dom.mapLoadingMetaEl.textContent = view.meta;
  const quoteEl = dom.mapLoadingOverlayEl.querySelector<HTMLElement>("#map-loading-quote");
  // The quote stays for the whole load, warnings and recovery buttons included.
  if (quoteEl) renderLoreQuoteFigure(quoteEl, pickLoginLoreQuote(seed));
};
