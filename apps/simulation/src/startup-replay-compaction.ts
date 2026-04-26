type CheckpointNow = (options?: { ignoreMemoryGuard?: boolean }) => Promise<string>;

type StartupReplayCompactionOptions = {
  checkpointNow: CheckpointNow;
  recoveredEventCount: number;
  startupReplayCompactionMinEvents: number;
  log: {
    info: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
};

export const createStartupReplayCompactionRunner = (
  options: StartupReplayCompactionOptions
): (() => Promise<void>) | undefined => {
  if (options.recoveredEventCount < options.startupReplayCompactionMinEvents) {
    return undefined;
  }

  return async (): Promise<void> => {
    const startedAt = Date.now();
    try {
      const checkpointResult = await options.checkpointNow({ ignoreMemoryGuard: true });
      options.log.info(
        {
          durationMs: Date.now() - startedAt,
          recoveredEventCount: options.recoveredEventCount,
          startupReplayCompactionMinEvents: options.startupReplayCompactionMinEvents,
          checkpointResult
        },
        "simulation startup replay compaction checkpoint attempt completed"
      );
    } catch (error) {
      options.log.error(
        {
          err: error,
          durationMs: Date.now() - startedAt,
          recoveredEventCount: options.recoveredEventCount,
          startupReplayCompactionMinEvents: options.startupReplayCompactionMinEvents
        },
        "simulation startup replay compaction checkpoint failed"
      );
    }
  };
};
