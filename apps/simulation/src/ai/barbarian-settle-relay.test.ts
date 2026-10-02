import { describe, expect, it } from "vitest";
import { createBarbSettleRelay } from "./barbarian-settle-relay.js";

const setup = () => {
  const clock = { t: 1_000 };
  const posted: Array<{ type: string; commandId: string; settledAt: number }> = [];
  const relay = createBarbSettleRelay({ barbPlayerId: "barbarian-1", postToWorker: (m) => posted.push(m), now: () => clock.t });
  return { clock, posted, relay };
};

describe("createBarbSettleRelay", () => {
  it("posts barb_settled when a submitted barb command resolves, is rejected or is cancelled", () => {
    const { clock, posted, relay } = setup();
    for (const id of ["a", "b", "c", "d"]) relay.onSubmitted(id);
    clock.t = 31_000;
    relay.onEvent({ eventType: "COMBAT_RESOLVED", playerId: "barbarian-1", commandId: "a" });
    relay.onEvent({ eventType: "COMMAND_REJECTED", playerId: "barbarian-1", commandId: "b" });
    relay.onEvent({ eventType: "COMMAND_RESOLVED", playerId: "barbarian-1", commandId: "c" });
    relay.onEvent({ eventType: "COMBAT_CANCELLED", playerId: "barbarian-1", commandId: "x", cancelledCommandIds: ["d"] });
    expect(posted.map((m) => m.commandId)).toEqual(["a", "b", "c", "d"]);
    expect(posted.every((m) => m.type === "barb_settled" && m.settledAt === 31_000)).toBe(true);
    expect(relay.size()).toBe(0);
  });

  it("does not settle early on unrelated events for the same command", () => {
    const { posted, relay } = setup();
    relay.onSubmitted("a");
    relay.onEvent({ eventType: "COMMAND_ACCEPTED", playerId: "barbarian-1", commandId: "a" });
    relay.onEvent({ eventType: "TILE_DELTA_BATCH", playerId: "barbarian-1", commandId: "a" });
    expect(posted).toEqual([]);
  });

  it("ignores other players and unknown command ids, and settles each command once", () => {
    const { posted, relay } = setup();
    relay.onSubmitted("a");
    relay.onEvent({ eventType: "COMBAT_RESOLVED", playerId: "player-1", commandId: "a" });
    relay.onEvent({ eventType: "COMBAT_RESOLVED", playerId: "barbarian-1", commandId: "zzz" });
    relay.onEvent({ eventType: "COMBAT_RESOLVED", playerId: "barbarian-1", commandId: "a" });
    relay.onEvent({ eventType: "COMBAT_RESOLVED", playerId: "barbarian-1", commandId: "a" });
    expect(posted.map((m) => m.commandId)).toEqual(["a"]);
  });

  it("stays bounded: entries older than the in-flight timeout are dropped, and clear() empties it", () => {
    const { clock, relay } = setup();
    relay.onSubmitted("old");
    clock.t += 46_000;
    relay.onSubmitted("new");
    expect(relay.size()).toBe(1);
    relay.clear();
    expect(relay.size()).toBe(0);
  });
});
