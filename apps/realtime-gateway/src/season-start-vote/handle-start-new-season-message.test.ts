import { describe, expect, it, vi } from "vitest";
import { handleStartNewSeasonMessage, type StartNewSeasonMessageDeps } from "./handle-start-new-season-message.js";

const makeDeps = (overrides: Partial<StartNewSeasonMessageDeps> = {}) => ({
  playerId: "p1",
  isGuest: false,
  isAdmin: false,
  force: false,
  nextContest: {
    commit: vi.fn(async () => ({ ok: true as const, count: 1, started: false })),
    forceStart: vi.fn(async (): Promise<{ seasonId: string } | undefined> => ({ seasonId: "s2" })),
    isStarting: vi.fn(() => false)
  },
  sendError: vi.fn(),
  recordGatewayEvent: vi.fn(),
  ...overrides
});

describe("handleStartNewSeasonMessage", () => {
  it("admin force-start starts the next contest", async () => {
    const deps = makeDeps({ isAdmin: true, force: true });
    await handleStartNewSeasonMessage(deps);
    expect(deps.nextContest.forceStart).toHaveBeenCalled();
    expect(deps.nextContest.commit).not.toHaveBeenCalled();
    expect(deps.sendError).not.toHaveBeenCalled();
  });

  it("rejects force from a non-admin without committing or starting", async () => {
    const deps = makeDeps({ force: true });
    await handleStartNewSeasonMessage(deps);
    expect(deps.sendError).toHaveBeenCalledWith("FORCE_START_FORBIDDEN", expect.any(String));
    expect(deps.nextContest.forceStart).not.toHaveBeenCalled();
    expect(deps.nextContest.commit).not.toHaveBeenCalled();
  });

  // Regression: repeated holds while the world was building each got a
  // SEASON_NOT_READY error even though the first one had worked.
  it("treats a force-start while one is already building as in progress, not an error", async () => {
    const deps = makeDeps({ isAdmin: true, force: true });
    deps.nextContest.isStarting.mockReturnValue(true);
    await handleStartNewSeasonMessage(deps);
    expect(deps.nextContest.forceStart).not.toHaveBeenCalled();
    expect(deps.sendError).not.toHaveBeenCalled();
  });

  it("reports SEASON_NOT_READY when there is nothing to force-start", async () => {
    const deps = makeDeps({ isAdmin: true, force: true });
    deps.nextContest.forceStart.mockResolvedValueOnce(undefined);
    await handleStartNewSeasonMessage(deps);
    expect(deps.sendError).toHaveBeenCalledWith("SEASON_NOT_READY", expect.any(String));
  });

  it("a normal press commits the House, passing on guest status", async () => {
    const deps = makeDeps({ isGuest: true });
    await handleStartNewSeasonMessage(deps);
    expect(deps.nextContest.commit).toHaveBeenCalledWith("p1", true);
  });

  // Regression: a guest's press used to count as one of the two votes that
  // reset the world for everyone.
  it("passes a refused commitment back to the player", async () => {
    const deps = makeDeps({ isGuest: true });
    deps.nextContest.commit.mockResolvedValueOnce({ ok: false, code: "ACCOUNT_REQUIRED", message: "sign in" } as never);
    await handleStartNewSeasonMessage(deps);
    expect(deps.sendError).toHaveBeenCalledWith("ACCOUNT_REQUIRED", "sign in");
  });

  it("reports SEASON_NOT_READY when the simulation rejects the start", async () => {
    const deps = makeDeps();
    deps.nextContest.commit.mockRejectedValueOnce(new Error("nope"));
    await handleStartNewSeasonMessage(deps);
    expect(deps.sendError).toHaveBeenCalledWith("SEASON_NOT_READY", expect.any(String));
  });

  it("requires auth", async () => {
    const deps = makeDeps({ playerId: undefined });
    await handleStartNewSeasonMessage(deps);
    expect(deps.sendError).toHaveBeenCalledWith("NO_AUTH", expect.any(String));
  });
});
