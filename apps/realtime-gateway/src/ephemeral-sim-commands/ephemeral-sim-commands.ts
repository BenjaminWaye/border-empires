/**
 * Best-effort, non-durable gateway -> simulation commands.
 *
 * Each of these drives in-memory view or cleanup work in the simulation and is
 * exempt there from durable persistence (see simulation-service.ts's
 * isEphemeralViewCommand), so it is sent with clientSeq 0 and never collides
 * with the commands table's UNIQUE(player_id, client_seq). A failure only means
 * one view refresh or cleanup pass is skipped, so errors are logged and
 * swallowed rather than surfaced as GATEWAY_INTERNAL_ERROR.
 *
 * - WATCH_MUSTER / UNWATCH_MUSTER: live muster panel subscription.
 * - CHECK_STRANDED_REGION: forwarded from the client's SUBSCRIBE_CHUNKS camera
 *   updates so the simulation releases stranded frontier tiles in the chunk a
 *   player is looking at (docs/stranded-frontier-cleanup-plan.md). Each chunk
 *   is forwarded at most once per session (that is, until the next login) and
 *   at most once per STRANDED_REGION_MIN_INTERVAL_MS, so the simulation sees a
 *   handful of cheap region checks per login, not one per camera move.
 */

import type { CommandEnvelope } from "@border-empires/sim-protocol";

export const STRANDED_REGION_MIN_INTERVAL_MS = 2_000;
/** Far above the number of chunks in a world (see the simulation's REGION_CHUNKS_X/Y); a hard bound regardless. */
export const STRANDED_REGION_MAX_CHUNKS_PER_SESSION = 256;

export type StrandedRegionCheckOutcome = "forwarded" | "deduped" | "throttled" | "capped" | "failed" | "unauthenticated" | "unavailable";

export const STRANDED_REGION_CHECK_OUTCOMES: readonly StrandedRegionCheckOutcome[] = ["forwarded", "deduped", "throttled", "capped", "failed", "unauthenticated", "unavailable"];

export type EphemeralSimCommandSession = { sessionId: string; playerId?: string | undefined };

export type EphemeralSimCommandsDeps = {
  /** Submits with the caller's usual timeout already applied. */
  submitCommand: (command: CommandEnvelope) => Promise<unknown>;
  isSimulationConnected: () => boolean;
  now: () => number;
  logWarn: (error: unknown, message: string) => void;
  onStrandedRegionCheck: (outcome: StrandedRegionCheckOutcome) => void;
};

export type EphemeralSimCommands = {
  watchMuster: (session: EphemeralSimCommandSession, playerId: string, x: number, y: number) => Promise<void>;
  unwatchMuster: (session: EphemeralSimCommandSession, playerId: string) => Promise<void>;
  checkStrandedRegion: (session: EphemeralSimCommandSession, chunk: { cx: number; cy: number }) => void;
};

type StrandedRegionSessionState = { checkedChunks: Set<string>; lastForwardedAt: number };

export const createEphemeralSimCommands = (deps: EphemeralSimCommandsDeps): EphemeralSimCommands => {
  // Keyed by the session object, so state is dropped with the session (a new
  // login is a new session and starts with an empty set) and needs no cleanup.
  const strandedRegionStateBySession = new WeakMap<EphemeralSimCommandSession, StrandedRegionSessionState>();

  const submitBestEffort = async (command: CommandEnvelope, failureMessage: string): Promise<boolean> => {
    try {
      await deps.submitCommand(command);
      return true;
    } catch (error) {
      deps.logWarn(error, failureMessage);
      return false;
    }
  };

  return {
    watchMuster: async (session, playerId, x, y) => {
      await submitBestEffort({
        commandId: `watch-muster:${session.sessionId}:${deps.now()}`,
        sessionId: session.sessionId,
        playerId,
        clientSeq: 0,
        issuedAt: deps.now(),
        type: "WATCH_MUSTER",
        payloadJson: JSON.stringify({ x, y })
      }, "gateway watch muster failed (best-effort)");
    },
    unwatchMuster: async (session, playerId) => {
      await submitBestEffort({
        commandId: `unwatch-muster:${session.sessionId}:${deps.now()}`,
        sessionId: session.sessionId,
        playerId,
        clientSeq: 0,
        issuedAt: deps.now(),
        type: "UNWATCH_MUSTER",
        payloadJson: "{}"
      }, "gateway unwatch muster failed (best-effort)");
    },
    checkStrandedRegion: (session, chunk) => {
      const playerId = session.playerId;
      if (!playerId) {
        deps.onStrandedRegionCheck("unauthenticated");
        return;
      }
      if (!deps.isSimulationConnected()) {
        deps.onStrandedRegionCheck("unavailable");
        return;
      }
      let state = strandedRegionStateBySession.get(session);
      if (!state) {
        state = { checkedChunks: new Set(), lastForwardedAt: Number.NEGATIVE_INFINITY };
        strandedRegionStateBySession.set(session, state);
      }
      const chunkKey = `${chunk.cx},${chunk.cy}`;
      if (state.checkedChunks.has(chunkKey)) {
        deps.onStrandedRegionCheck("deduped");
        return;
      }
      if (state.checkedChunks.size >= STRANDED_REGION_MAX_CHUNKS_PER_SESSION) {
        deps.onStrandedRegionCheck("capped");
        return;
      }
      const now = deps.now();
      // Throttled chunks are not marked checked: the client re-sends
      // SUBSCRIBE_CHUNKS as the camera moves, so they are picked up later.
      if (now - state.lastForwardedAt < STRANDED_REGION_MIN_INTERVAL_MS) {
        deps.onStrandedRegionCheck("throttled");
        return;
      }
      state.checkedChunks.add(chunkKey);
      state.lastForwardedAt = now;
      deps.onStrandedRegionCheck("forwarded");
      // The simulation validates cx/cy and counts invalid regions; the gateway only dedupes.
      void submitBestEffort({
        commandId: `system-runtime:stranded-region:${session.sessionId}:${chunkKey}:${now}`,
        sessionId: "system-runtime:stranded-region",
        playerId,
        clientSeq: 0,
        issuedAt: now,
        type: "CHECK_STRANDED_REGION",
        payloadJson: JSON.stringify({ cx: chunk.cx, cy: chunk.cy })
      }, "gateway stranded region check failed (best-effort)").then((ok) => {
        if (!ok) deps.onStrandedRegionCheck("failed");
      });
    }
  };
};
