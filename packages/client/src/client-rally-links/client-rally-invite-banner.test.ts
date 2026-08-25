// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountRallyInvitePanel } from "./client-rally-links.js";

describe("mountRallyInvitePanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((el) => el.remove());
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Regression: this used to be a floating full-screen popup appended to
  // document.body with its own z-index. #auth-overlay lives inside #hud
  // (position: fixed, z-index: auto), which forms its own stacking
  // context -- so a body-level popup with a numerically *lower* z-index
  // still painted on top of the sign-in card, covering the Google
  // sign-in button. It must be inserted inline into the auth panel
  // instead of floating over it.
  it("inserts the invite message inline into the sign-in card instead of a floating popup", () => {
    window.history.pushState(null, "", "/r/test-code-123");
    document.body.innerHTML = `
      <div id="hud">
        <div id="auth-overlay">
          <div id="auth-card">
            <section class="auth-panel">
              <div class="auth-panel-emblem"></div>
              <div class="auth-panel-head">
                <div class="auth-panel-title">Sign in to your empire</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "not found" }) }));

    mountRallyInvitePanel({ wsUrl: "ws://127.0.0.1:3001/ws" });

    expect(document.querySelector(".rally-link-panel")).toBeNull();
    const banner = document.querySelector(".auth-panel-head")!.previousElementSibling;
    expect(banner?.className).toBe("rally-invite-banner");
    expect(banner?.parentElement).toBe(document.querySelector(".auth-panel"));
  });
});
