// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountRallyNewPanel } from "./client-rally-links.js";

describe("mountRallyNewPanel button click flow", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((el) => el.remove());
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Regression: clicking "Get Rally Link" more than once (before dismissing
  // the first panel) used to append a second full-screen .rally-link-panel
  // and a second duplicate <style> tag with no guard against re-entry.
  it("does not stack a second panel or duplicate the stylesheet on a repeat click", () => {
    document.body.innerHTML = `
      <div id="hud"></div>
      <button type="button" data-rally-link-open>Get Rally Link</button>
    `;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "not found" }) }));

    mountRallyNewPanel({ wsUrl: "ws://127.0.0.1:3001/ws" });

    const button = document.querySelector<HTMLButtonElement>("[data-rally-link-open]")!;
    button.click();
    button.click();

    expect(document.querySelectorAll(".rally-link-panel").length).toBe(1);
    expect(document.querySelectorAll("#rally-link-panel-style").length).toBe(1);
  });

  // Regression: after dismissing the panel, clicking again used to re-add
  // a second identical <style> tag to <head> since the injection was
  // unconditional on every createPanel() call.
  it("does not re-inject the stylesheet after dismiss and reopen", () => {
    document.body.innerHTML = `
      <div id="hud"></div>
      <button type="button" data-rally-link-open>Get Rally Link</button>
    `;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "not found" }) }));

    mountRallyNewPanel({ wsUrl: "ws://127.0.0.1:3001/ws" });

    const button = document.querySelector<HTMLButtonElement>("[data-rally-link-open]")!;
    button.click();
    document.querySelector<HTMLButtonElement>("[data-rally-dismiss]")!.click();
    button.click();

    expect(document.querySelectorAll(".rally-link-panel").length).toBe(1);
    expect(document.querySelectorAll("#rally-link-panel-style").length).toBe(1);
  });
});
