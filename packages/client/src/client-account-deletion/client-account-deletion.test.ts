// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "firebase/auth";
import { deletionEndpoint, openAccountDeletion, requestAccountDeletion } from "./client-account-deletion.js";

vi.mock("firebase/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("firebase/auth")>(),
  getAuth: () => ({ currentUser: { isAnonymous: true, providerData: [] } })
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ""; });
const user = { getIdToken: vi.fn(async () => "fresh-owner-token") };
describe("account deletion requests", () => {
  it("uses the configured gateway and strips unrelated WebSocket URL parameters", () => {
    expect(deletionEndpoint("wss://api-staging.borderempires.com/ws?token=wrong#fragment")).toBe("https://api-staging.borderempires.com/account/deletion");
    expect(deletionEndpoint("ws://127.0.0.1:3101/ws")).toBe("http://127.0.0.1:3101/account/deletion");
  });
  it("sends ownership only in the bearer header and requires a complete receipt", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, request: { requestId: "receipt", completeBy: 2000, status: "pending" } }), { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    expect(await requestAccountDeletion(user, "wss://api.borderempires.com/ws")).toEqual({ requestId: "receipt", completeBy: 2000, status: "pending" });
    expect(fetch).toHaveBeenCalledWith("https://api.borderempires.com/account/deletion", expect.objectContaining({
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer fresh-owner-token" }, body: '{"confirmation":"DELETE"}'
    }));
  });
  it("can retry with the original token after Firebase removed the user", async () => {
    const noLongerSignedIn = { getIdToken: vi.fn(async () => { throw new Error("user deleted"); }) };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ request: { requestId: "receipt", completeBy: 2000, status: "pending" } }))));
    expect(await requestAccountDeletion(noLongerSignedIn, "wss://api.borderempires.com/ws", "original-token")).toMatchObject({ requestId: "receipt" });
    expect(noLongerSignedIn.getIdToken).not.toHaveBeenCalled();
  });
  it.each([
    [401, { error: "recent_sign_in_required" }], [503, { error: "deletion_retry_required" }],
    [200, { request: { status: "awaiting_identity" } }], [200, { ok: true }]
  ])("does not report deletion success for %i %j", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    await expect(requestAccountDeletion(user, "wss://api.borderempires.com/ws")).rejects.toThrow();
  });
  it("times out using AbortController on older supported WebViews", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")));
    })));
    const result = expect(requestAccountDeletion(user, "wss://api.borderempires.com/ws")).rejects.toThrow("request aborted");
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps deletion usable with keyboard focus on iOS versions without native dialog support", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: undefined });
    try {
      openAccountDeletion(getAuth(), "wss://api.borderempires.com/ws");
      const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
      expect(dialog.parentElement?.className).toBe("account-deletion-backdrop");
      expect(document.activeElement?.textContent).toBe("Cancel");
      dialog.querySelector<HTMLInputElement>("input")?.focus();
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
      expect(document.activeElement?.textContent).toBe("Delete account");
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      expect(document.querySelector("dialog")).toBeNull();
      expect(document.querySelector(".account-deletion-backdrop")).toBeNull();
    } finally {
      if (original) Object.defineProperty(HTMLDialogElement.prototype, "showModal", original);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    }
  });
});
