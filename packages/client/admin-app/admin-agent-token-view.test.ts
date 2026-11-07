// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import type { AdminApi } from "./admin-api.js";
import { parseMintedAgentToken, renderAgentTokenPanel, STALE_SIGN_IN_MESSAGE } from "./admin-agent-token-view.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("agent token view", () => {
  it("parses only a well-formed mint response", () => {
    expect(parseMintedAgentToken('{"ok":true,"token":"bea1.x","expiresAt":5}')).toEqual({ token: "bea1.x", expiresAt: 5 });
    expect(parseMintedAgentToken('{"ok":false,"error":"unauthorized"}')).toBeUndefined();
    expect(parseMintedAgentToken("not json")).toBeUndefined();
  });

  it("mints for the chosen lifetime and shows the token with this deployment's host", async () => {
    const post = vi.fn<AdminApi["post"]>(async () => ({ ok: true, contentType: "application/json", body: '{"ok":true,"token":"bea1.123.n.s","expiresAt":123}' }));
    const panel = renderAgentTokenPanel({ get: vi.fn(), post }, "https://api.borderempires.com");
    panel.querySelector("select")!.value = "168";
    panel.querySelector<HTMLButtonElement>("button.primary")!.click();
    await flush();
    expect(post).toHaveBeenCalledWith("/admin/agent-token?ttlHours=168");
    expect(panel.querySelector("textarea")!.value).toBe("bea1.123.n.s");
    expect(panel.textContent).toContain("api.borderempires.com");
  });

  it("shows the server's refusal instead of a token", async () => {
    const post = vi.fn<AdminApi["post"]>(async () => ({ ok: false, status: 503, message: "disabled" }));
    const panel = renderAgentTokenPanel({ get: vi.fn(), post }, "https://api.borderempires.com");
    panel.querySelector<HTMLButtonElement>("button.primary")!.click();
    await flush();
    expect(panel.querySelector("textarea")).toBeNull();
    expect(panel.querySelector(".error")!.textContent).toBe("disabled");
  });

  it("asks for a fresh sign-in when the gateway refuses to mint (401)", async () => {
    const post = vi.fn<AdminApi["post"]>(async () => ({ ok: false, status: 401, message: "not the admin" }));
    const panel = renderAgentTokenPanel({ get: vi.fn(), post }, "https://api.borderempires.com");
    panel.querySelector<HTMLButtonElement>("button.primary")!.click();
    await flush();
    expect(panel.querySelector(".error")!.textContent).toBe(STALE_SIGN_IN_MESSAGE);
  });
});
