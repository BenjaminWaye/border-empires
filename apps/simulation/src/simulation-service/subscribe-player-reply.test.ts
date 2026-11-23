import { describe, expect, it } from "vitest";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { withFogMemory } from "./subscribe-player-reply.js";

type Player = NonNullable<PlayerSubscriptionSnapshot["player"]>;

describe("withFogMemory", () => {
  const player = { id: "me" } as unknown as Player;

  it("adds explored tiles and the land the player lost with who took it", () => {
    const reply = withFogMemory(player, { exploredTiles: [[0, 0, 3]] as never, lostTiles: [{ x: 4, y: 5, ownerId: "barbarian-1" }] });
    expect(reply).toMatchObject({ id: "me", exploredTiles: [[0, 0, 3]], lostTiles: [{ x: 4, y: 5, ownerId: "barbarian-1" }] });
  });

  it("adds neither field when there is nothing to remember", () => {
    const reply = withFogMemory(player, { exploredTiles: undefined, lostTiles: [] });
    expect(reply).not.toHaveProperty("exploredTiles");
    expect(reply).not.toHaveProperty("lostTiles");
  });
});
