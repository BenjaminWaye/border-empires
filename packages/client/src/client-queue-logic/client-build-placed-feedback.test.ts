import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { sendDevelopmentBuild } from "./client-development-dispatch.js";

const payload = { type: "BUILD_STRUCTURE" as const, x: 4, y: 5, structureType: "FORT" as const };
const opts = { x: 4, y: 5, label: "Fort at (4, 5)", optimisticKind: "FORT" as const };
const deps = (available: number) => ({
  keyFor: (x: number, y: number) => `${x},${y}`,
  queueDevelopmentAction: vi.fn(() => true),
  developmentSlotSummary: () => ({ busy: 3 - available, limit: 3, available }),
  developmentSlotReason: () => "full",
  pushFeed: vi.fn(),
  showCaptureAlert: vi.fn(),
  renderHud: vi.fn(),
  sendGameMessage: vi.fn(() => true)
});

// Regression: pressing Place sent the build silently -- no toast, no feed line.
describe("Place feedback", () => {
  it("confirms a build that starts straight away", () => {
    const d = deps(1);
    expect(sendDevelopmentBuild(createInitialState(), payload, vi.fn(), opts, d)).toBe(true);
    expect(d.pushFeed).toHaveBeenCalledWith(expect.stringContaining("Building placed: Fort at (4, 5)"), "info", "success");
    // Feed line only: never the big alert banner.
    expect(d.showCaptureAlert).not.toHaveBeenCalled();
  });

  it("confirms a build that joins the development queue", () => {
    const d = deps(0);
    expect(sendDevelopmentBuild(createInitialState(), payload, vi.fn(), opts, d)).toBe(true);
    expect(d.pushFeed).toHaveBeenCalledWith(expect.stringContaining("Build queued"), "info", "success");
    expect(d.showCaptureAlert).not.toHaveBeenCalled();
  });

  it("stays silent for queue drains and removals", () => {
    const d = deps(1);
    sendDevelopmentBuild(createInitialState(), payload, vi.fn(), { ...opts, fromQueue: true }, d);
    sendDevelopmentBuild(createInitialState(), { type: "REMOVE_STRUCTURE", x: 4, y: 5 }, vi.fn(), opts, d);
    expect(d.showCaptureAlert).not.toHaveBeenCalled();
    expect(d.pushFeed).not.toHaveBeenCalled();
  });
});
