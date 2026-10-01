import { describe, expect, it } from "vitest";

import { createReachUpdateReplay, type ReachUpdatePayload } from "./reach-update-replay.js";

type FakeSocket = { id: string };

const reach = (revision: number, tileKeys: string[] = ["1,1"]): Record<string, unknown> => ({ type: "REACH_UPDATE", tileKeys, revision });

const createHarness = (maxEntries = 10) => {
  const sizes: number[] = [];
  let evictions = 0;
  const replay = createReachUpdateReplay<FakeSocket>({
    maxEntries,
    onSizeChange: (n) => sizes.push(n),
    onEvict: () => {
      evictions += 1;
    }
  });
  const sent: Array<{ socket: FakeSocket; payload: ReachUpdatePayload }> = [];
  const send = (socket: FakeSocket, payload: ReachUpdatePayload): void => {
    sent.push({ socket, payload });
  };
  return { replay, sizes, sent, send, evictions: () => evictions };
};

describe("createReachUpdateReplay", () => {
  it("replays the latest REACH_UPDATE to a socket that joined after it was relayed", () => {
    const { replay, sent, send } = createHarness();
    const existing = { id: "tab-1" };
    const joining = { id: "tab-2" };
    replay.observe("p1", reach(3), [existing]);
    replay.observe("p1", reach(4, ["1,1", "1,2"]), [existing]);

    expect(replay.replayTo("p1", joining, send)).toBe(true);
    expect(sent).toEqual([{ socket: joining, payload: reach(4, ["1,1", "1,2"]) }]);
  });

  it("does not resend to a socket that already received the latest push", () => {
    const { replay, sent, send } = createHarness();
    const socket = { id: "tab-1" };
    replay.observe("p1", reach(2), [socket]);

    expect(replay.replayTo("p1", socket, send)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("replays at most once per socket per push", () => {
    const { replay, sent, send } = createHarness();
    const joining = { id: "tab-2" };
    replay.observe("p1", reach(2), []);

    expect(replay.replayTo("p1", joining, send)).toBe(true);
    expect(replay.replayTo("p1", joining, send)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("does nothing for a player it never saw a REACH_UPDATE for", () => {
    const { replay, sent, send } = createHarness();
    expect(replay.replayTo("p1", { id: "tab-1" }, send)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("ignores non-REACH_UPDATE payloads", () => {
    const { replay } = createHarness();
    replay.observe("p1", { type: "PLAYER_UPDATE", gold: 5 }, []);
    replay.observe("p1", { type: "REACH_UPDATE", revision: 1 }, []);
    expect(replay.size()).toBe(0);
  });

  it("drops a player's entry on forget so a later session cannot get a stale border", () => {
    const { replay, sent, send, sizes } = createHarness();
    replay.observe("p1", reach(5), []);
    replay.forget("p1");

    expect(replay.size()).toBe(0);
    expect(sizes).toEqual([1, 0]);
    expect(replay.replayTo("p1", { id: "tab-1" }, send)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("caps entries, evicting the least-recently-updated player and counting it", () => {
    const { replay, evictions, sizes } = createHarness(2);
    replay.observe("p1", reach(1), []);
    replay.observe("p2", reach(1), []);
    replay.observe("p1", reach(2), []); // p1 refreshed, so p2 is now oldest
    replay.observe("p3", reach(1), []);

    expect(replay.size()).toBe(2);
    expect(evictions()).toBe(1);
    expect(sizes.at(-1)).toBe(2);
    const sent: string[] = [];
    replay.replayTo("p2", { id: "x" }, () => sent.push("p2"));
    replay.replayTo("p1", { id: "x" }, () => sent.push("p1"));
    replay.replayTo("p3", { id: "x" }, () => sent.push("p3"));
    expect(sent).toEqual(["p1", "p3"]);
  });
});
