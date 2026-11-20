// Pushes fresh relic map hints when an aether wake starts, stops or changes
// hands (docs/relics.md, "Aether wake"). Deferred through the runtime's
// scheduler, so it never runs inside the command turn that changed the relic
// and stops when scheduled tasks are frozen; a burst of changes is one
// broadcast; only subscribed human Houses are sent one (AI read world state,
// offline Houses get hints on connect); one House's failed update is logged
// and never stops the others or escapes into the process.
export type RelicWakeBroadcastDeps = {
  readonly players: () => Iterable<{ readonly id: string; readonly isAi: boolean }>;
  readonly isSubscribed: (playerId: string) => boolean;
  readonly schedule: (task: () => void) => void;
  /** Builds and sends one House's PLAYER_UPDATE (which carries its relic map hints). */
  readonly emit: (playerId: string) => void;
  readonly onError: (error: unknown, playerId: string) => void;
};

/** Returns the change notifier for RelicMapHintIndex. */
export const createRelicWakeBroadcast = (deps: RelicWakeBroadcastDeps): (() => void) => {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    deps.schedule(() => {
      pending = false;
      for (const player of deps.players()) {
        if (player.isAi || !deps.isSubscribed(player.id)) continue;
        try {
          deps.emit(player.id);
        } catch (error) {
          deps.onError(error, player.id);
        }
      }
    });
  };
};
