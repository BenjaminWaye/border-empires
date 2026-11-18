// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { MapLoadingView } from "../client-map-loading-view/client-map-loading-view.js";
import { LOGIN_LORE_QUOTES, loginLoreQuoteForView, pickLoginLoreQuote, renderMapLoadingCopy } from "./client-login-lore-quotes.js";

const calmView: MapLoadingView = {
  title: "Syncing empire...",
  meta: "Connected",
  showRetry: false,
  showReload: false,
  showDiagnostics: false,
  tone: "normal"
};

const memoirText = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/lore/duke-memoir.md"), "utf8")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("LOGIN_LORE_QUOTES", () => {
  it("quotes the Sable memoir verbatim", () => {
    const sableQuotes = LOGIN_LORE_QUOTES.filter((quote) => quote.source.includes("Sable"));
    expect(sableQuotes.length).toBeGreaterThan(0);
    for (const quote of sableQuotes) {
      const body = quote.text.replace(/\.$/, "").toLowerCase();
      expect(memoirText, quote.text).toContain(body);
    }
  });

  it("keeps every quote short enough for the loading card", () => {
    for (const quote of LOGIN_LORE_QUOTES) {
      expect(quote.text.length, quote.text).toBeLessThanOrEqual(120);
      expect(quote.source.length).toBeGreaterThan(0);
    }
  });
});

describe("pickLoginLoreQuote", () => {
  it("returns the same quote for the same seed and spreads across loads", () => {
    expect(pickLoginLoreQuote(1_763_000_000_123)).toBe(pickLoginLoreQuote(1_763_000_000_123));
    const seen = new Set(Array.from({ length: LOGIN_LORE_QUOTES.length }, (_, i) => pickLoginLoreQuote(1_763_000_000_000 + i)));
    expect(seen.size).toBe(LOGIN_LORE_QUOTES.length);
  });

  it("falls back to a valid quote for zero, negative and non-finite seeds", () => {
    for (const seed of [0, -7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(LOGIN_LORE_QUOTES).toContain(pickLoginLoreQuote(seed));
    }
  });
});

describe("loginLoreQuoteForView", () => {
  it("shows a quote only while the wait is calm", () => {
    expect(loginLoreQuoteForView(calmView, 3)).not.toBeNull();
    expect(loginLoreQuoteForView({ ...calmView, tone: "warn" }, 3)).toBeNull();
    expect(loginLoreQuoteForView({ ...calmView, showDiagnostics: true }, 3)).toBeNull();
    expect(loginLoreQuoteForView({ ...calmView, showRetry: true }, 3)).toBeNull();
  });
});

describe("renderMapLoadingCopy", () => {
  const mount = () => {
    document.body.innerHTML = `
      <div id="map-loading-overlay">
        <div id="map-loading-title"></div>
        <div id="map-loading-meta"></div>
        <figure id="map-loading-quote" hidden>
          <blockquote id="map-loading-quote-text"></blockquote>
          <figcaption id="map-loading-quote-source"></figcaption>
        </figure>
      </div>`;
    return {
      mapLoadingOverlayEl: document.querySelector<HTMLElement>("#map-loading-overlay")!,
      mapLoadingTitleEl: document.querySelector<HTMLElement>("#map-loading-title")!,
      mapLoadingMetaEl: document.querySelector<HTMLElement>("#map-loading-meta")!
    };
  };

  it("writes the title, meta and quote, then hides the quote on a warning", () => {
    const dom = mount();
    renderMapLoadingCopy(dom, calmView, 5);
    const quote = pickLoginLoreQuote(5);
    expect(dom.mapLoadingTitleEl.textContent).toBe("Syncing empire...");
    expect(dom.mapLoadingMetaEl.textContent).toBe("Connected");
    expect(document.querySelector<HTMLElement>("#map-loading-quote")!.hidden).toBe(false);
    expect(document.querySelector("#map-loading-quote-text")!.textContent).toBe(quote.text);
    expect(document.querySelector("#map-loading-quote-source")!.textContent).toBe(quote.source);

    renderMapLoadingCopy(dom, { ...calmView, tone: "warn", title: "Map sync stalled" }, 5);
    expect(dom.mapLoadingTitleEl.textContent).toBe("Map sync stalled");
    expect(document.querySelector<HTMLElement>("#map-loading-quote")!.hidden).toBe(true);
  });
});
