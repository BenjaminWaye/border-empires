import { describe, expect, it } from "vitest";

import { createMusterWatchGuard } from "./client-muster-watch.js";

describe("muster watch guard", () => {
  it("suppresses unwatch when no watch was ever sent", () => {
    const guard = createMusterWatchGuard();
    expect(guard.shouldSendUnwatch()).toBe(false);
    expect(guard.shouldSendUnwatch()).toBe(false);
  });

  it("allows exactly one unwatch per outstanding watch", () => {
    const guard = createMusterWatchGuard();
    guard.noteWatchSent();
    expect(guard.shouldSendUnwatch()).toBe(true);
    // Menu close after the unwatch already went out — nothing left to unwatch.
    expect(guard.shouldSendUnwatch()).toBe(false);
  });

  it("re-watching after an unwatch arms the guard again", () => {
    const guard = createMusterWatchGuard();
    guard.noteWatchSent();
    expect(guard.shouldSendUnwatch()).toBe(true);
    guard.noteWatchSent();
    expect(guard.shouldSendUnwatch()).toBe(true);
  });

  it("repeated watches collapse into a single outstanding unwatch", () => {
    const guard = createMusterWatchGuard();
    guard.noteWatchSent();
    guard.noteWatchSent();
    expect(guard.shouldSendUnwatch()).toBe(true);
    expect(guard.shouldSendUnwatch()).toBe(false);
  });
});
