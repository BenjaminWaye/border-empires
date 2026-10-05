import { describe, expect, it } from "vitest";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import {
  createEphemeralSimCommands,
  STRANDED_REGION_MAX_CHUNKS_PER_SESSION,
  STRANDED_REGION_MIN_INTERVAL_MS,
  type StrandedRegionCheckOutcome
} from "./ephemeral-sim-commands.js";

const setup = (options: { connected?: boolean; failSubmit?: boolean } = {}) => {
  let now = 10_000;
  const submitted: CommandEnvelope[] = [];
  const outcomes: StrandedRegionCheckOutcome[] = [];
  const warnings: string[] = [];
  const commands = createEphemeralSimCommands({
    submitCommand: async (command) => {
      submitted.push(command);
      if (options.failSubmit) throw new Error("sim down");
    },
    isSimulationConnected: () => options.connected ?? true,
    now: () => now,
    logWarn: (_error, message) => warnings.push(message),
    onStrandedRegionCheck: (outcome) => outcomes.push(outcome)
  });
  return { commands, submitted, outcomes, warnings, advance: (ms: number) => { now += ms; } };
};

describe("ephemeral sim commands: CHECK_STRANDED_REGION", () => {
  it("forwards a chunk once as a non-durable system command", () => {
    const { commands, submitted, outcomes } = setup();
    const session = { sessionId: "s1", playerId: "player-1" };

    commands.checkStrandedRegion(session, { cx: 2, cy: 3 });

    expect(outcomes).toEqual(["forwarded"]);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      type: "CHECK_STRANDED_REGION",
      playerId: "player-1",
      clientSeq: 0,
      sessionId: "system-runtime:stranded-region",
      payloadJson: JSON.stringify({ cx: 2, cy: 3 })
    });
    expect(submitted[0]?.commandId.startsWith("system-runtime:stranded-region:s1:2,3:")).toBe(true);
  });

  it("never re-checks a chunk in the same session, but a new session (next login) does", () => {
    const { commands, submitted, outcomes, advance } = setup();
    const firstLogin = { sessionId: "s1", playerId: "player-1" };
    commands.checkStrandedRegion(firstLogin, { cx: 1, cy: 1 });
    advance(STRANDED_REGION_MIN_INTERVAL_MS);
    commands.checkStrandedRegion(firstLogin, { cx: 1, cy: 1 });
    expect(outcomes).toEqual(["forwarded", "deduped"]);

    commands.checkStrandedRegion({ sessionId: "s2", playerId: "player-1" }, { cx: 1, cy: 1 });
    expect(outcomes).toEqual(["forwarded", "deduped", "forwarded"]);
    expect(submitted).toHaveLength(2);
  });

  it("throttles a second chunk inside the interval without marking it checked", () => {
    const { commands, submitted, outcomes, advance } = setup();
    const session = { sessionId: "s1", playerId: "player-1" };
    commands.checkStrandedRegion(session, { cx: 0, cy: 0 });
    commands.checkStrandedRegion(session, { cx: 1, cy: 0 });
    expect(outcomes).toEqual(["forwarded", "throttled"]);

    advance(STRANDED_REGION_MIN_INTERVAL_MS);
    commands.checkStrandedRegion(session, { cx: 1, cy: 0 });
    expect(outcomes).toEqual(["forwarded", "throttled", "forwarded"]);
    expect(submitted.map((command) => command.payloadJson)).toEqual([JSON.stringify({ cx: 0, cy: 0 }), JSON.stringify({ cx: 1, cy: 0 })]);
  });

  it("bounds the per-session chunk set", () => {
    const { commands, outcomes, advance } = setup();
    const session = { sessionId: "s1", playerId: "player-1" };
    for (let i = 0; i < STRANDED_REGION_MAX_CHUNKS_PER_SESSION; i += 1) {
      commands.checkStrandedRegion(session, { cx: i, cy: 0 });
      advance(STRANDED_REGION_MIN_INTERVAL_MS);
    }
    commands.checkStrandedRegion(session, { cx: 9_999, cy: 0 });
    expect(outcomes.at(-1)).toBe("capped");
    expect(outcomes.filter((outcome) => outcome === "forwarded")).toHaveLength(STRANDED_REGION_MAX_CHUNKS_PER_SESSION);
  });

  it("skips unauthenticated sessions and a disconnected simulation, and counts submit failures", async () => {
    const unauthenticated = setup();
    unauthenticated.commands.checkStrandedRegion({ sessionId: "s1" }, { cx: 0, cy: 0 });
    expect(unauthenticated.outcomes).toEqual(["unauthenticated"]);

    const disconnected = setup({ connected: false });
    disconnected.commands.checkStrandedRegion({ sessionId: "s1", playerId: "player-1" }, { cx: 0, cy: 0 });
    expect(disconnected.outcomes).toEqual(["unavailable"]);
    expect(disconnected.submitted).toHaveLength(0);

    const failing = setup({ failSubmit: true });
    failing.commands.checkStrandedRegion({ sessionId: "s1", playerId: "player-1" }, { cx: 0, cy: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    expect(failing.outcomes).toEqual(["forwarded", "failed"]);
    expect(failing.warnings).toEqual(["gateway stranded region check failed (best-effort)"]);
  });
});

describe("ephemeral sim commands: muster watch", () => {
  it("sends WATCH_MUSTER/UNWATCH_MUSTER with clientSeq 0 and swallows failures", async () => {
    const ok = setup();
    const session = { sessionId: "s1", playerId: "player-1" };
    await ok.commands.watchMuster(session, "player-1", 4, 5);
    await ok.commands.unwatchMuster(session, "player-1");
    expect(ok.submitted.map((command) => [command.type, command.clientSeq, command.payloadJson])).toEqual([
      ["WATCH_MUSTER", 0, JSON.stringify({ x: 4, y: 5 })],
      ["UNWATCH_MUSTER", 0, "{}"]
    ]);

    const failing = setup({ failSubmit: true });
    await expect(failing.commands.watchMuster(session, "player-1", 1, 1)).resolves.toBeUndefined();
    expect(failing.warnings).toEqual(["gateway watch muster failed (best-effort)"]);
  });
});
