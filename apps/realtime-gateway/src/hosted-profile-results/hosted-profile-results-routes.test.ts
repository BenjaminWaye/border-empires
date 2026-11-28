// The hosting service records a hosted sector's results per account, so the
// House profile can show them marked "Hosted" (owner decision Q4).
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { registerHostedProfileResultsRoutes } from "./hosted-profile-results-routes.js";
import { InMemoryHostedProfileResultsStore } from "./hosted-profile-results-store.js";

const KEY = "h".repeat(40);
const headers = { authorization: `Bearer ${KEY}` };

const build = async () => {
  const bindings = new InMemoryGatewayAuthBindingStore();
  await bindings.bindIdentity({ uid: "uid-a", playerId: "player-a" });
  await bindings.bindIdentity({ uid: "uid-b", playerId: "player-b" });
  const store = new InMemoryHostedProfileResultsStore();
  const app = Fastify();
  registerHostedProfileResultsRoutes(app, { token: KEY, authBindingStore: bindings, store });
  return { app, store };
};

const body = { sectorId: "s-abc123", endedAt: 5_000, finished: true, houses: 24, standings: [{ uid: "uid-a", rank: 1 }, { uid: "uid-b", rank: 7 }, { uid: "uid-gone", rank: 9 }] };

describe("recording hosted results for profiles", () => {
  it("records each member under their player id, skips unknown accounts, and replaces a later record", async () => {
    const { app, store } = await build();
    const response = await app.inject({ method: "POST", url: "/admin/hosted-results/record", headers, payload: body });
    expect(response.json()).toEqual({ ok: true, recorded: 2, unknown: 1 });
    expect(await store.listForPlayer("player-b", 10)).toEqual([{ playerId: "player-b", sectorId: "s-abc123", endedAt: 5_000, finished: true, rank: 7, houses: 24 }]);
    await app.inject({ method: "POST", url: "/admin/hosted-results/record", headers, payload: { ...body, standings: [{ uid: "uid-b", rank: 6 }] } });
    expect((await store.listForPlayer("player-b", 10)).map((row) => row.rank)).toEqual([6]);
    await app.close();
  });

  it("refuses another key and a malformed body", async () => {
    const { app, store } = await build();
    expect((await app.inject({ method: "POST", url: "/admin/hosted-results/record", headers: { authorization: "Bearer nope" }, payload: body })).statusCode).toBe(401);
    for (const bad of [{ ...body, sectorId: "../x" }, { ...body, finished: "yes" }, { ...body, standings: [{ uid: "uid-a", rank: 99 }] }, { ...body, houses: 0 }]) {
      expect((await app.inject({ method: "POST", url: "/admin/hosted-results/record", headers, payload: bad })).statusCode).toBe(400);
    }
    expect(await store.listForPlayer("player-a", 10)).toEqual([]);
    await app.close();
  });
});
