// The analytics consent prompt and its setting (client-analytics-consent.ts).
// The prompt appears once, on the web, until the player chooses; both answers
// are buttons of the same weight, and nothing runs until "Yes". The setting
// in Settings → Account changes the answer at any time.
import "./client-analytics-consent.css";

import type { AnalyticsConsentController } from "./client-analytics-consent.js";

const BANNER_ATTR = "data-analytics-consent";
const CHOICE_ATTR = "data-analytics-consent-choice";
const TOGGLE_ATTR = "data-analytics-consent-toggle";

/** The controller of this page, set at start-up; undefined in the native apps, where analytics never runs. */
let active: AnalyticsConsentController | undefined;

export const analyticsConsentBannerHtml = (): string => `
  <div class="analytics-consent" role="region" aria-label="Usage analytics" aria-live="polite" ${BANNER_ATTR}>
    <p class="analytics-consent-text">May we use Google Analytics to see how Border Empires is used, so we can improve it? It stores an identifier in your browser and runs only if you say yes. You can change your mind in Settings, under Account. <a href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a></p>
    <div class="analytics-consent-actions">
      <button type="button" class="panel-btn" ${CHOICE_ATTR}="denied">No, thanks</button>
      <button type="button" class="panel-btn" ${CHOICE_ATTR}="granted">Yes, that's fine</button>
    </div>
  </div>`;

/** The Settings → Account row. Empty where there is nothing to consent to. */
export const analyticsConsentSettingHtml = (): string => {
  if (!active) return "";
  const on = active.choice() === "granted";
  return `
    <div class="analytics-consent-setting">
      <span>Usage analytics (Google Analytics): <strong ${TOGGLE_ATTR}-state>${on ? "on" : "off"}</strong></span>
      <button type="button" class="panel-btn" role="switch" aria-checked="${on}" aria-label="Usage analytics" ${TOGGLE_ATTR}>${on ? "Turn off" : "Turn on"}</button>
    </div>`;
};

const refreshSettings = (doc: Document): void => {
  if (!active) return;
  const on = active.choice() === "granted";
  doc.querySelectorAll(`[${TOGGLE_ATTR}-state]`).forEach((el) => { el.textContent = on ? "on" : "off"; });
  doc.querySelectorAll(`[${TOGGLE_ATTR}]`).forEach((el) => {
    el.textContent = on ? "Turn off" : "Turn on";
    el.setAttribute("aria-checked", String(on));
  });
};

/** `?analytics=ask` shows the prompt again, so the answer can be changed without entering the game (linked from the privacy policy). */
export const ANALYTICS_ASK_AGAIN_PARAM = "analytics";

const askedAgain = (search: string): boolean => new URLSearchParams(search).get(ANALYTICS_ASK_AGAIN_PARAM) === "ask";

/**
 * Shows the prompt if the player has not chosen yet, or asked to choose
 * again, and handles the prompt and the setting from then on. Call once at
 * start-up.
 */
export const startAnalyticsConsentUi = (consent: AnalyticsConsentController | undefined, doc: Document = document, search: string = doc.location?.search ?? ""): void => {
  active = consent;
  if (!consent) return;
  doc.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const choice = target?.closest(`[${CHOICE_ATTR}]`)?.getAttribute(CHOICE_ATTR);
    if (choice === "granted" || choice === "denied") {
      if (choice === "granted") consent.grant();
      else consent.withdraw();
      doc.querySelector(`[${BANNER_ATTR}]`)?.remove();
      refreshSettings(doc);
      return;
    }
    if (target?.closest(`[${TOGGLE_ATTR}]`)) {
      if (consent.choice() === "granted") consent.withdraw();
      else consent.grant();
      // Answered here, so the prompt is not needed any more.
      doc.querySelector(`[${BANNER_ATTR}]`)?.remove();
      refreshSettings(doc);
    }
  });
  if (consent.choice() === undefined || askedAgain(search)) doc.body.insertAdjacentHTML("beforeend", analyticsConsentBannerHtml());
};
