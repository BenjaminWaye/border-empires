import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicHouseUrl, requestPublicProfileLink, sharePublicProfile, stopSharingPublicProfile } from "./client-public-house-share.js";
import { publicProfileShareView, resetPublicProfileShareState, type PublicProfileShareDeps } from "./client-public-house-share-state.js";

const reply = (body: unknown): typeof fetch => vi.fn().mockResolvedValue({ json: async () => body }) as unknown as typeof fetch;
const deps = (fetchImpl: typeof fetch, signedIn = true) => ({ wsUrl: "ws://localhost:3101/ws", getIdToken: async () => (signedIn ? "tok" : undefined), fetchImpl });

describe("public profile share", () => {
  beforeEach(() => resetPublicProfileShareState());

  it("builds the page link from the public id on this origin", () => {
    expect(publicHouseUrl("AbCdEfGhIjKlMnOp", { origin: "https://staging.borderempires.com" })).toBe("https://staging.borderempires.com/house.html?h=AbCdEfGhIjKlMnOp");
  });

  it("asks the gateway for the link with the bearer token", async () => {
    const fetchImpl = reply({ ok: true, publicId: "AbCdEfGhIjKlMnOp" });
    expect(await requestPublicProfileLink(deps(fetchImpl))).toEqual({ ok: true, publicId: "AbCdEfGhIjKlMnOp" });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/hq/public-profile/link");
    expect(init).toEqual({ method: "POST", headers: { authorization: "Bearer tok" } });
  });

  it("reports signed-out, guest and failed requests without calling share", async () => {
    const nav = { share: vi.fn(), clipboard: { writeText: vi.fn() } };
    expect(await sharePublicProfile(deps(reply({}), false), nav)).toBe("Sign in to share");
    expect(await sharePublicProfile(deps(reply({ ok: false, error: "account_required" })), nav)).toBe("Save your account to share");
    expect(await sharePublicProfile(deps(vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch), nav)).toBe("Couldn't make the link. Try again");
    expect(nav.share).not.toHaveBeenCalled();
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("copies the link when there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await sharePublicProfile(deps(reply({ ok: true, publicId: "AbCdEfGhIjKlMnOp" })), { clipboard: { writeText } })).toBe("Link copied");
    expect(String(writeText.mock.calls[0]?.[0])).toMatch(/\/house\.html\?h=AbCdEfGhIjKlMnOp$/);
  });

  // Playtest 2026-11-27: Share showed no message or link, only a new "Stop sharing" button.
  it("keeps the link on screen and says it was copied, even when the share sheet is dismissed", async () => {
    const d = { ...deps(reply({ ok: true, publicId: "AbCdEfGhIjKlMnOp" })), accountKey: () => "uid-share" };
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("dismissed"), { name: "AbortError" }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await sharePublicProfile(d, { share, clipboard: { writeText } })).toBe("Link copied");
    expect(writeText).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledOnce();
    expect(publicProfileShareView(d).link).toMatch(/\/house\.html\?h=AbCdEfGhIjKlMnOp$/);
    // No clipboard and no sheet: the link is still shown, with a terse note.
    expect(await sharePublicProfile(d, {})).toBe("Copy link below");
    expect(publicProfileShareView(d).link).toMatch(/AbCdEfGhIjKlMnOp$/);
  });

  it("stops sharing with a DELETE and reports failure without throwing", async () => {
    const fetchImpl = reply({ ok: true, publicId: null });
    expect(await stopSharingPublicProfile(deps(fetchImpl))).toBe("Sharing stopped");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/hq/public-profile/link");
    expect(init).toEqual({ method: "DELETE", headers: { authorization: "Bearer tok" } });
    expect(await stopSharingPublicProfile(deps(reply({ ok: false })))).toBe("Couldn't stop sharing. Try again");
    expect(await stopSharingPublicProfile(deps(reply({}), false))).toBe("Sign in to stop sharing");
  });

  const stateOf = (d: PublicProfileShareDeps, nowMs?: number) => publicProfileShareView(d, nowMs).state;

  it("reports not sharing until the gateway says a link exists, then follows share and stop", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => ({
      json: async () => (init?.method === "POST" ? { ok: true, publicId: "AbCdEfGhIjKlMnOp" } : { ok: true, publicId: null })
    })) as unknown as typeof fetch;
    const d = { ...deps(fetchImpl), accountKey: () => "uid-1" };
    expect(stateOf(d)).toBe("unknown");
    await vi.waitFor(() => expect(stateOf(d)).toBe("off"));
    expect(await sharePublicProfile(d, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })).toBe("Link copied");
    expect(stateOf(d)).toBe("on");
    expect(await stopSharingPublicProfile(d)).toBe("Sharing stopped");
    expect(stateOf(d)).toBe("off");
    // Another account on this device asks again rather than reusing the first one's answer.
    expect(stateOf({ ...d, accountKey: () => "uid-2" })).toBe("unknown");
  });

  it("reports an existing link as sharing", async () => {
    const d = { ...deps(reply({ ok: true, publicId: "AbCdEfGhIjKlMnOp" })), accountKey: () => "uid-1" };
    stateOf(d);
    await vi.waitFor(() => expect(stateOf(d)).toBe("on"));
  });

  it("does not let a status check that started before a share overwrite it", async () => {
    let answerGet: (body: unknown) => void = () => undefined;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "GET"
        ? new Promise((resolve) => { answerGet = (body) => resolve({ json: async () => body }); })
        : Promise.resolve({ json: async () => ({ ok: true, publicId: "AbCdEfGhIjKlMnOp" }) })
    ) as unknown as typeof fetch;
    const d = { ...deps(fetchImpl), accountKey: () => "uid-1" };
    expect(stateOf(d)).toBe("unknown");
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await sharePublicProfile(d, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    answerGet({ ok: true, publicId: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stateOf(d)).toBe("on");
  });

  it("asks again once signed in instead of backing off when there was no token yet", async () => {
    let token: string | undefined;
    const fetchImpl = reply({ ok: true, publicId: "AbCdEfGhIjKlMnOp" });
    const d = { wsUrl: "ws://localhost:3101/ws", getIdToken: async () => token, fetchImpl, accountKey: () => "uid-1" };
    stateOf(d);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
    token = "tok";
    await vi.waitFor(() => expect(stateOf(d)).toBe("on"));
  });

  it("re-checks an old answer in the background so a link made elsewhere shows up", async () => {
    let publicId: string | null = null;
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ ok: true, publicId }) })) as unknown as typeof fetch;
    const d = { ...deps(fetchImpl), accountKey: () => "uid-1" };
    stateOf(d, 0);
    await vi.waitFor(() => expect(stateOf(d, 1_000)).toBe("off"));
    publicId = "AbCdEfGhIjKlMnOp";
    const later = Date.now() + 61_000;
    expect(stateOf(d, later)).toBe("off");
    await vi.waitFor(() => expect(stateOf(d, later)).toBe("on"));
  });
});
