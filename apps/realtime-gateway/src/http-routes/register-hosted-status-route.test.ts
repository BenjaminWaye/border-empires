import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { latestHumanVisit, registerHostedStatusRoute } from "./register-hosted-status-route.js";

const setup = (lastHumanVisitAt: () => Promise<number | undefined>) => {
  const app = Fastify();
  registerHostedStatusRoute(app, { adminAuthorized: (header) => header === "Bearer sector-admin", lastHumanVisitAt });
  return app;
};

describe("GET /admin/hosted/status", () => {
  it("reports the last human visit to the hosting service, behind the sector's admin token", async () => {
    const app = setup(async () => 1_800_000_000_000);
    expect((await app.inject({ method: "GET", url: "/admin/hosted/status" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/admin/hosted/status", headers: { authorization: "Bearer other" } })).statusCode).toBe(401);
    const response = await app.inject({ method: "GET", url: "/admin/hosted/status", headers: { authorization: "Bearer sector-admin" } });
    expect(response.json()).toEqual({ ok: true, lastHumanVisitAt: 1_800_000_000_000 });
  });

  it("leaves the time out when no human has come, and answers 503 when the store fails", async () => {
    expect((await setup(async () => undefined).inject({ method: "GET", url: "/admin/hosted/status", headers: { authorization: "Bearer sector-admin" } })).json()).toEqual({ ok: true });
    const failing = setup(async () => { throw new Error("db locked"); });
    expect((await failing.inject({ method: "GET", url: "/admin/hosted/status", headers: { authorization: "Bearer sector-admin" } })).statusCode).toBe(503);
  });
});

describe("latestHumanVisit", () => {
  it("takes the latest visit across players", () => {
    expect(latestHumanVisit([])).toBeUndefined();
    expect(latestHumanVisit([{ lastSeenAt: 5 }, { lastSeenAt: 9 }, { lastSeenAt: 7 }])).toBe(9);
  });
});
