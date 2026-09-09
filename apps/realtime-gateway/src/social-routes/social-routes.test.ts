import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerSocialRoutes, type PublicSocialView } from "./social-routes.js";

const buildApp = (viewsByPlayerId: Record<string, PublicSocialView>) => {
  const app = Fastify();
  registerSocialRoutes(app, {
    getSocialSnapshotForPlayer: (playerId: string) => viewsByPlayerId[playerId] ?? { allies: [], activeTruces: [], truceBreaksThisSeason: [] }
  });
  return app;
};

describe("GET /hq/social/by-player/:playerId", () => {
  it("returns a player's allies, active truces, and truce-break history", async () => {
    const app = buildApp({
      "player-1": {
        allies: ["ally-1", "ally-2"],
        activeTruces: [{ otherPlayerId: "rival-1", otherPlayerName: "Rival One", endsAt: 5_000 }],
        truceBreaksThisSeason: [{ targetPlayerId: "rival-2", targetPlayerName: "Rival Two", brokenAt: 1_000 }]
      }
    });

    const response = await app.inject({ method: "GET", url: "/hq/social/by-player/player-1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      allies: ["ally-1", "ally-2"],
      activeTruces: [{ otherPlayerId: "rival-1", otherPlayerName: "Rival One", endsAt: 5_000 }],
      truceBreaksThisSeason: [{ targetPlayerId: "rival-2", targetPlayerName: "Rival Two", brokenAt: 1_000 }]
    });
  });

  it("returns empty allies/truces/breaks for a player with none", async () => {
    const app = buildApp({});
    const response = await app.inject({ method: "GET", url: "/hq/social/by-player/player-unknown" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ allies: [], activeTruces: [], truceBreaksThisSeason: [] });
  });

  it("returns 503 when social data isn't wired up", async () => {
    const app = Fastify();
    registerSocialRoutes(app, {});
    const response = await app.inject({ method: "GET", url: "/hq/social/by-player/player-1" });
    expect(response.statusCode).toBe(503);
  });
});
