import { describe, expect, it, vi } from "vitest";
import { publicHouseUrl, requestPublicProfileLink, sharePublicProfile } from "./client-public-house-share.js";

const reply = (body: unknown): typeof fetch => vi.fn().mockResolvedValue({ json: async () => body }) as unknown as typeof fetch;
const deps = (fetchImpl: typeof fetch, signedIn = true) => ({ wsUrl: "ws://localhost:3101/ws", getIdToken: async () => (signedIn ? "tok" : undefined), fetchImpl });

describe("public profile share", () => {
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
});
