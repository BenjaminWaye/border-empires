import { describe, expect, it, vi } from "vitest";
import { createMarchWinChancePreviewPoller, marchPreviewBaseWinChance } from "./client-march-win-chance-preview.js";
import { createInitialState } from "../client-state/client-state.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("march win-chance preview", () => {
  it("requests a march-flagged ATTACK_PREVIEW at most once per refresh window", () => {
    const send = vi.fn(() => true);
    let now = 0;
    const poller = createMarchWinChancePreviewPoller({ x: 0, y: 0 }, { x: 4, y: 0 }, send, () => now);
    poller.poll();
    now = 400;
    poller.poll();
    now = 5_000;
    poller.poll();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith({ type: "ATTACK_PREVIEW", fromX: 0, fromY: 0, toX: 4, toY: 0, march: true });
  });

  it("reads the cached server odds for the origin->target pair, ignoring invalid previews", () => {
    const state = createInitialState();
    expect(marchPreviewBaseWinChance(state, { x: 0, y: 0 }, { x: 4, y: 0 }, keyFor)).toBeUndefined();
    state.attackPreviewCacheByKey.set("0,0->4,0", { fromKey: "0,0", toKey: "4,0", valid: true, winChance: 0.71, receivedAt: Date.now() });
    expect(marchPreviewBaseWinChance(state, { x: 0, y: 0 }, { x: 4, y: 0 }, keyFor)).toBe(0.71);
    state.attackPreviewCacheByKey.set("0,0->4,0", { fromKey: "0,0", toKey: "4,0", valid: false, reason: "target not adjacent", receivedAt: Date.now() });
    expect(marchPreviewBaseWinChance(state, { x: 0, y: 0 }, { x: 4, y: 0 }, keyFor)).toBeUndefined();
  });
});
