/**
 * Per-connect "hello" pushes for a preparing player.
 *
 * Each push is isolated so one failing does not block the others or fail the
 * whole PreparePlayer call. The reach resend is forced rather than
 * change-filtered (runtime-reach-update.ts): the border usually matches what
 * this player was last sent, but a freshly connected client has never seen it
 * and needs the authoritative set immediately — without it the client falls
 * back to its own approximation, which is what let the visible border disagree
 * with what the server would actually allow.
 */
export type PerConnectHelloRuntime = {
  emitShardRainHelloFor: (playerId: string) => void;
  resendReachForPlayer: (playerId: string) => void;
};

export type PerConnectHelloLog = {
  error: (payload: Record<string, unknown>, message: string) => void;
};

export const emitPerConnectHellos = (
  runtime: PerConnectHelloRuntime,
  playerId: string,
  log: PerConnectHelloLog
): void => {
  const hellos: Array<[string, () => void]> = [
    ["shard rain hello", () => runtime.emitShardRainHelloFor(playerId)],
    ["reach resend", () => runtime.resendReachForPlayer(playerId)]
  ];
  for (const [label, hello] of hellos) {
    try {
      hello();
    } catch (error) {
      log.error({ err: error, playerId }, `${label} failed`);
    }
  }
};
