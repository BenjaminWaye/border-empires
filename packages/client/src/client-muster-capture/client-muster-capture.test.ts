import { describe, expect, it, vi } from "vitest";
import {
  createInitialMusterCaptureLabelState,
  handleMusterCaptureMessage,
  liveMusterCaptureLabels,
  MUSTER_CAPTURE_GAIN_COLOR,
  MUSTER_CAPTURE_LABEL_MAX,
  MUSTER_CAPTURE_LABEL_MS,
  MUSTER_CAPTURE_LOSS_COLOR,
  pushMusterCaptureLabel
} from "./client-muster-capture.js";

const stateWith = () => ({ ...createInitialMusterCaptureLabelState(), playerNames: new Map([["kara", "Kara"]]) });

describe("handleMusterCaptureMessage", () => {
  it("labels the tile and posts a feed entry for the captor", () => {
    const state = stateWith();
    const pushFeed = vi.fn();
    const renderHud = vi.fn();
    expect(handleMusterCaptureMessage({ type: "MUSTER_CAPTURED", x: 4, y: 7, amount: 240, gained: 90, fromPlayerId: "kara" }, state, pushFeed, renderHud, 1_000)).toBe(true);
    expect(state.musterCaptureLabels).toEqual([{ id: 1, x: 4, y: 7, text: "+90 manpower", color: MUSTER_CAPTURE_GAIN_COLOR, startedAt: 1_000 }]);
    expect(pushFeed).toHaveBeenCalledWith(expect.objectContaining({ text: "From Kara at (4, 7): +90 manpower (240 on flag, at cap).", focusX: 4, focusY: 7, severity: "success" }));
    expect(renderHud).toHaveBeenCalled();
  });

  it("labels the tile in red for the flag's owner", () => {
    const state = stateWith();
    const pushFeed = vi.fn();
    handleMusterCaptureMessage({ type: "MUSTER_LOST", x: 4, y: 7, amount: 240, byPlayerId: "kara" }, state, pushFeed, () => {}, 1_000);
    expect(state.musterCaptureLabels[0]).toMatchObject({ text: "−240 manpower", color: MUSTER_CAPTURE_LOSS_COLOR });
    expect(pushFeed).toHaveBeenCalledWith(expect.objectContaining({ text: "Taken by Kara at (4, 7): −240 manpower.", severity: "warn" }));
  });

  it("claims but ignores a malformed message, and passes on other types", () => {
    const state = stateWith();
    const pushFeed = vi.fn();
    expect(handleMusterCaptureMessage({ type: "MUSTER_LOST", x: 4 }, state, pushFeed, () => {})).toBe(true);
    expect(handleMusterCaptureMessage({ type: "SCOUT_SIGHTED" }, state, pushFeed, () => {})).toBe(false);
    expect(state.musterCaptureLabels).toEqual([]);
    expect(pushFeed).not.toHaveBeenCalled();
  });
});

describe("muster capture labels", () => {
  it("expire after the label duration and stay bounded", () => {
    const state = stateWith();
    for (let i = 0; i < MUSTER_CAPTURE_LABEL_MAX + 5; i += 1) pushMusterCaptureLabel(state, { x: i, y: 0, text: "+1 manpower", color: "#fff", startedAt: i });
    expect(state.musterCaptureLabels).toHaveLength(MUSTER_CAPTURE_LABEL_MAX);
    expect(state.musterCaptureLabels[0]!.x).toBe(5);
    expect(liveMusterCaptureLabels(state, MUSTER_CAPTURE_LABEL_MS + 10)).toHaveLength(MUSTER_CAPTURE_LABEL_MAX - 6);
    expect(liveMusterCaptureLabels(state, MUSTER_CAPTURE_LABEL_MS * 3)).toHaveLength(0);
  });
});
