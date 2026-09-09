import { describe, expect, it } from "vitest";
import { handleGetSeasonParticipationForPlayer } from "./season-participation-rpc-handler.js";

describe("handleGetSeasonParticipationForPlayer", () => {
  it("returns the store's rows as JSON", async () => {
    const rows = [{ seasonId: "season-1", seasonSequence: 1, playerId: "player-1", playerName: "Nauticus", rank: 1, score: 10, tiles: 20, incomePerMinute: 1, techs: 2, endedAt: 1_000 }];
    const store = { listParticipationForPlayer: async () => rows };

    const response = await new Promise((resolve) => {
      handleGetSeasonParticipationForPlayer(store, { request: { player_id: "player-1" } }, (_error, res) => resolve(res));
    });

    expect(response).toEqual({ ok: true, participation_json: JSON.stringify(rows) });
  });

  it("returns ok:false without calling the store when no playerId is given", async () => {
    let called = false;
    const store = { listParticipationForPlayer: async () => { called = true; return []; } };

    const response = await new Promise((resolve) => {
      handleGetSeasonParticipationForPlayer(store, { request: {} }, (_error, res) => resolve(res));
    });

    expect(response).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("surfaces a store error as the callback's error argument", async () => {
    const store = { listParticipationForPlayer: async () => { throw new Error("db down"); } };

    const [error, response] = await new Promise<[Error | null, unknown]>((resolve) => {
      handleGetSeasonParticipationForPlayer(store, { request: { player_id: "player-1" } }, (err, res) => resolve([err, res]));
    });

    expect(error?.message).toBe("db down");
    expect(response).toEqual({ ok: false });
  });
});
