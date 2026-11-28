// @vitest-environment happy-dom
// The consent prompt appears once, until the player chooses; Settings changes the answer.
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsConsent, AnalyticsConsentController } from "./client-analytics-consent.js";
import { analyticsConsentSettingHtml, startAnalyticsConsentUi } from "./client-analytics-consent-ui.js";

const controller = (initial?: AnalyticsConsent): AnalyticsConsentController => {
  let choice = initial;
  return {
    choice: () => choice,
    analytics: () => undefined,
    grant: vi.fn(() => { choice = "granted"; }),
    withdraw: vi.fn(() => { choice = "denied"; })
  };
};

const freshDocument = (): Document => document.implementation.createHTMLDocument("test");

afterEach(() => { startAnalyticsConsentUi(undefined, freshDocument()); });

describe("the analytics consent prompt", () => {
  it("asks once, with two answers of the same weight, and records yes", () => {
    const doc = freshDocument();
    const consent = controller();
    startAnalyticsConsentUi(consent, doc);
    const buttons = Array.from(doc.querySelectorAll("[data-analytics-consent-choice]"));
    expect(buttons.map((button) => button.className)).toEqual(["panel-btn", "panel-btn"]);
    expect(doc.querySelector("[data-analytics-consent] a")?.getAttribute("href")).toBe("/privacy.html");
    (doc.querySelector('[data-analytics-consent-choice="granted"]') as HTMLElement).click();
    expect(consent.grant).toHaveBeenCalledTimes(1);
    expect(doc.querySelector("[data-analytics-consent]")).toBeNull();
  });

  it("records no", () => {
    const doc = freshDocument();
    const consent = controller();
    startAnalyticsConsentUi(consent, doc);
    (doc.querySelector('[data-analytics-consent-choice="denied"]') as HTMLElement).click();
    expect(consent.withdraw).toHaveBeenCalledTimes(1);
    expect(consent.grant).not.toHaveBeenCalled();
  });

  it("does not ask again once answered, nor where analytics cannot run", () => {
    const answered = freshDocument();
    startAnalyticsConsentUi(controller("denied"), answered);
    expect(answered.querySelector("[data-analytics-consent]")).toBeNull();
    const native = freshDocument();
    startAnalyticsConsentUi(undefined, native);
    expect(native.querySelector("[data-analytics-consent]")).toBeNull();
    expect(analyticsConsentSettingHtml()).toBe("");
  });

  it("asks again when opened with ?analytics=ask, so the answer can be changed without entering the game", () => {
    const doc = freshDocument();
    startAnalyticsConsentUi(controller("granted"), doc, "?analytics=ask");
    expect(doc.querySelector("[data-analytics-consent]")).not.toBeNull();
  });

  it("lets the answer be changed in Settings", () => {
    const doc = freshDocument();
    const consent = controller("granted");
    startAnalyticsConsentUi(consent, doc);
    doc.body.insertAdjacentHTML("beforeend", analyticsConsentSettingHtml());
    expect(doc.querySelector("[data-analytics-consent-toggle-state]")?.textContent).toBe("on");
    (doc.querySelector("[data-analytics-consent-toggle]") as HTMLElement).click();
    expect(consent.withdraw).toHaveBeenCalledTimes(1);
    expect(doc.querySelector("[data-analytics-consent-toggle-state]")?.textContent).toBe("off");
    expect(doc.querySelector("[data-analytics-consent-toggle]")?.textContent).toBe("Turn on");
    expect(doc.querySelector("[data-analytics-consent-toggle]")?.getAttribute("aria-checked")).toBe("false");
  });
});
