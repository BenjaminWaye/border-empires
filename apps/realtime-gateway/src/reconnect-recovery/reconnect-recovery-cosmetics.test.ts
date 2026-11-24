import { describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { buildInitMessage } from "./reconnect-recovery.js";

const buildWith = (shown?: Parameters<typeof buildInitMessage>[13]) =>
  buildInitMessage(
    { playerId: "player-1", playerName: "Nauticus" }, new InMemoryGatewayCommandStore(),
    undefined, "default", undefined, undefined, undefined, false, false, false, undefined, undefined, undefined, shown
  );

describe("INIT account cosmetics", () => {
  it("sends every non-default look so a joining player sees rivals' choices", async () => {
    const init = await buildWith({ rival: { musterFlag: "flag-high-noble" } });
    expect(init.playerCosmetics).toEqual({ rival: { musterFlag: "flag-high-noble" } });
  });

  it("adds nothing to INIT when nobody shows a cosmetic", async () => {
    expect("playerCosmetics" in (await buildWith({}))).toBe(false);
    expect("playerCosmetics" in (await buildWith())).toBe(false);
  });
});
