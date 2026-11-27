import { describe, expect, it } from "vitest";

import type { PlayerCosmeticSelection } from "@border-empires/shared";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { buildInitMessage } from "./reconnect-recovery.js";

const buildWith = (shown?: Record<string, PlayerCosmeticSelection>, lobbyIds: string[] = []) =>
  buildInitMessage(
    { playerId: "player-1", playerName: "Nauticus" }, new InMemoryGatewayCommandStore(),
    undefined, "default", undefined, undefined, undefined, false, false, false, undefined,
    lobbyIds.length > 0
      ? { type: "SEASON_LOBBY_UPDATE" as const, waitingCount: lobbyIds.length, maxPlayers: 10, roster: lobbyIds.map((playerId) => ({ playerId, name: playerId })) }
      : undefined,
    undefined,
    shown ? (playerId) => shown[playerId] : undefined
  );

describe("INIT account cosmetics", () => {
  it("sends the looks of this world's players so a joining player sees rivals' choices", async () => {
    const init = await buildWith({ "player-2": { musterFlag: "flag-high-noble" } });
    expect(init.playerCosmetics).toEqual({ "player-2": { musterFlag: "flag-high-noble" } });
  });

  it("leaves out an account that is not in the current world", async () => {
    const init = await buildWith({ "player-2": { crest: "crest-anchor" }, "old-season-account": { crest: "crest-kraken" } });
    expect(init.playerCosmetics).toEqual({ "player-2": { crest: "crest-anchor" } });
  });

  it("includes the joining player and the pending contest's lobby", async () => {
    const init = await buildWith({ "player-1": { crest: "crest-key" }, "lobby-only": { crest: "crest-stag" }, stranger: { crest: "crest-kraken" } }, ["lobby-only"]);
    expect(init.playerCosmetics).toEqual({ "player-1": { crest: "crest-key" }, "lobby-only": { crest: "crest-stag" } });
  });

  it("adds nothing to INIT when nobody shows a cosmetic", async () => {
    expect("playerCosmetics" in (await buildWith({}))).toBe(false);
    expect("playerCosmetics" in (await buildWith())).toBe(false);
  });
});
