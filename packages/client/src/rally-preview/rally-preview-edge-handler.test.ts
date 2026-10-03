import { afterEach, describe, expect, it, vi } from "vitest";

import { handleRallyPreview as handler } from "../../../../api/rally/[code].js";

const SHELL = "<html><head><title>Border Empires</title></head><body>app</body></html>";

const run = async (backend: (url: string) => Promise<Response>, backendUrl: string | null = "https://gw.example.test") => {
  if (backendUrl) process.env.BACKEND_URL = backendUrl;
  else delete process.env.BACKEND_URL;
  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = String(input);
    return url.endsWith("/index.html") ? new Response(SHELL) : backend(url);
  });
  vi.stubGlobal("fetch", fetchMock);
  const response = await handler(new Request("https://play.example.test/r/r_abc123"));
  return { response, html: await response.text(), fetchMock };
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BACKEND_URL;
});

describe("api/rally/[code] edge handler", () => {
  it("serves the app shell with the inviter's name in the preview tags", async () => {
    const { response, html } = await run(async (url) => {
      expect(url).toBe("https://gw.example.test/rally/preview/r_abc123");
      return Response.json({ ok: true, ownerName: "Sam" });
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(html).toContain("<title>Sam needs you in Border Empires</title>");
    expect(html).toContain("<body>app</body>");
  });

  it("still serves the shell with generic tags when the backend 404s, throws, or is not configured", async () => {
    for (const result of [
      await run(async () => new Response("nope", { status: 404 })),
      await run(async () => { throw new Error("backend down"); }),
      await run(async () => Response.json({ ok: true, ownerName: "Sam" }), null)
    ]) {
      expect(result.response.status).toBe(200);
      expect(result.html).toContain("<title>Border Empires</title>");
      expect(result.html).toContain('property="og:image"');
    }
  });

  it("does not call the backend for a malformed code", async () => {
    process.env.BACKEND_URL = "https://gw.example.test";
    const fetchMock = vi.fn(async () => new Response(SHELL));
    vi.stubGlobal("fetch", fetchMock);
    await handler(new Request("https://play.example.test/r/..%2Fadmin"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("502s only if the app shell itself cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    expect((await handler(new Request("https://play.example.test/r/r_abc123"))).status).toBe(502);
  });
});
