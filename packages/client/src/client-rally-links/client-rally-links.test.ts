import { describe, expect, it } from "vitest";

import { isRallyNewRoute, rallyApiOrigin, rallyCodeFromLocation, rallyLinkEndpoint, rallyShareUrl } from "./client-rally-links.js";

describe("client rally links", () => {
  it("detects rally creation and join routes", () => {
    expect(isRallyNewRoute({ pathname: "/rally/new" } as Location)).toBe(true);
    expect(isRallyNewRoute({ pathname: "/rally/new/" } as Location)).toBe(true);
    expect(isRallyNewRoute({ pathname: "/r/foo" } as Location)).toBe(false);

    expect(rallyCodeFromLocation({ pathname: "/r/r_abc123" } as Location)).toBe("r_abc123");
    expect(rallyCodeFromLocation({ pathname: "/r/r_abc123/" } as Location)).toBe("r_abc123");
    expect(rallyCodeFromLocation({ pathname: "/rally/new" } as Location)).toBeUndefined();
  });

  it("builds rally API endpoints from websocket URLs", () => {
    expect(rallyLinkEndpoint("wss://border-empires.fly.dev/ws")).toBe("https://border-empires-gateway.fly.dev/rally/links");
    expect(rallyLinkEndpoint("ws://127.0.0.1:3001/ws", "r_abc/123", { hostname: "localhost", protocol: "http:" } as Location)).toBe(
      "http://127.0.0.1:3101/rally/links/r_abc%2F123"
    );
  });

  it("lets env override the rally API origin", () => {
    expect(
      rallyApiOrigin(
        "wss://border-empires.fly.dev/ws",
        { hostname: "play.borderempires.com", protocol: "https:" } as Location,
        { VITE_RALLY_API_ORIGIN: "https://api.example.test/" }
      )
    ).toBe("https://api.example.test");
  });

  it("builds the share URL from the minting page's origin, not the server's PLAY_ORIGIN", () => {
    // Regression: staging's gateway returned a play.borderempires.com URL, so the
    // invite resolved against the production rally API and showed as expired.
    const link = { code: "r_abc-123", url: "https://play.borderempires.com/r/r_abc-123" };
    expect(rallyShareUrl(link, { origin: "https://staging.borderempires.com" })).toBe("https://staging.borderempires.com/r/r_abc-123");
    expect(rallyShareUrl(link, { origin: "http://localhost:5173/" })).toBe("http://localhost:5173/r/r_abc-123");
    expect(rallyShareUrl(link, { origin: "null" })).toBe(link.url);
    expect(rallyShareUrl(link, undefined)).toBe(link.url);
  });
});
