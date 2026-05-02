type SocketLike = { readyState: number };

type PlayerSubscriptionsOptions<TSocket extends SocketLike, TSnapshot> = {
  subscribePlayer: (playerId: string, subscriptionKey?: string) => Promise<TSnapshot>;
  unsubscribePlayer: (playerId: string, subscriptionKey?: string) => Promise<void>;
  subscriptionNamespace?: string;
};

export type PlayerSubscriptions<TSocket extends SocketLike, TSnapshot> = {
  attachSocket: (playerId: string, socket: TSocket) => void;
  addSocket: (playerId: string, socket: TSocket) => Promise<TSnapshot | undefined>;
  removeSocket: (playerId: string, socket: TSocket) => Promise<void>;
  socketsForPlayer: (playerId: string) => ReadonlySet<TSocket>;
  allSockets: () => ReadonlySet<TSocket>;
  snapshotForPlayer: (playerId: string) => TSnapshot | undefined;
  seedSnapshot: (playerId: string, snapshot: TSnapshot) => void;
  ensureSubscribed: (playerId: string) => Promise<TSnapshot>;
  refreshSnapshot: (playerId: string) => Promise<TSnapshot>;
  updateSnapshot: (playerId: string, updater: (snapshot: TSnapshot) => TSnapshot | void) => void;
};

const createSubscriptionNamespace = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const createPlayerSubscriptions = <TSocket extends SocketLike, TSnapshot>(
  options: PlayerSubscriptionsOptions<TSocket, TSnapshot>
): PlayerSubscriptions<TSocket, TSnapshot> => {
  const socketsByPlayer = new Map<string, Set<TSocket>>();
  const snapshotByPlayer = new Map<string, TSnapshot>();
  const subscribeInFlightByPlayer = new Map<string, Promise<TSnapshot>>();
  const subscribeGenerationByPlayer = new Map<string, number>();
  const subscriptionKeyByPlayer = new Map<string, string>();
  const subscribedPlayers = new Set<string>();
  const subscriptionNamespace = options.subscriptionNamespace ?? createSubscriptionNamespace();

  const subscribeOnce = async (playerId: string): Promise<TSnapshot> => {
    if (subscribedPlayers.has(playerId)) {
      const cachedSnapshot = snapshotByPlayer.get(playerId);
      if (cachedSnapshot) return cachedSnapshot;
    }
    const existingPromise = subscribeInFlightByPlayer.get(playerId);
    if (existingPromise) return existingPromise;

    const generation = (subscribeGenerationByPlayer.get(playerId) ?? 0) + 1;
    subscribeGenerationByPlayer.set(playerId, generation);
    const subscriptionKey = `${subscriptionNamespace}:${playerId}:${generation}`;
    subscriptionKeyByPlayer.set(playerId, subscriptionKey);

    const subscribePromise = options
      .subscribePlayer(playerId, subscriptionKey)
      .then(async (snapshot) => {
        const hasSockets = (socketsByPlayer.get(playerId)?.size ?? 0) > 0;
        const isCurrentGeneration = subscribeGenerationByPlayer.get(playerId) === generation;
        if (!hasSockets || !isCurrentGeneration) {
          await options.unsubscribePlayer(playerId, subscriptionKey).catch(() => undefined);
          return snapshot;
        }
        subscribedPlayers.add(playerId);
        snapshotByPlayer.set(playerId, snapshot);
        return snapshot;
      })
      .finally(() => {
        if (subscribeGenerationByPlayer.get(playerId) === generation) {
          subscribeInFlightByPlayer.delete(playerId);
        }
      });
    subscribeInFlightByPlayer.set(playerId, subscribePromise);
    return subscribePromise;
  };

  const attachSocket = (playerId: string, socket: TSocket): void => {
    let sockets = socketsByPlayer.get(playerId);
    if (!sockets) {
      sockets = new Set();
      socketsByPlayer.set(playerId, sockets);
    }
    sockets.add(socket);
  };

  return {
    attachSocket,
    async addSocket(playerId, socket) {
      attachSocket(playerId, socket);
      return subscribeOnce(playerId);
    },
    async removeSocket(playerId, socket) {
      const sockets = socketsByPlayer.get(playerId);
      if (!sockets) return;
      sockets.delete(socket);
      if (sockets.size > 0) return;
      socketsByPlayer.delete(playerId);
      snapshotByPlayer.delete(playerId);
      subscribeInFlightByPlayer.delete(playerId);
      subscribedPlayers.delete(playerId);
      const subscriptionKey = subscriptionKeyByPlayer.get(playerId);
      subscriptionKeyByPlayer.delete(playerId);
      await options.unsubscribePlayer(playerId, subscriptionKey);
    },
    socketsForPlayer(playerId) {
      return socketsByPlayer.get(playerId) ?? new Set<TSocket>();
    },
    allSockets() {
      const sockets = new Set<TSocket>();
      for (const playerSockets of socketsByPlayer.values()) {
        for (const socket of playerSockets) sockets.add(socket);
      }
      return sockets;
    },
    snapshotForPlayer(playerId) {
      return snapshotByPlayer.get(playerId);
    },
    seedSnapshot(playerId, snapshot) {
      snapshotByPlayer.set(playerId, snapshot);
    },
    ensureSubscribed(playerId) {
      return subscribeOnce(playerId);
    },
    async refreshSnapshot(playerId) {
      const subscriptionKey = subscriptionKeyByPlayer.get(playerId);
      subscribedPlayers.delete(playerId);
      subscribeInFlightByPlayer.delete(playerId);
      snapshotByPlayer.delete(playerId);
      if (subscriptionKey) {
        subscriptionKeyByPlayer.delete(playerId);
        await options.unsubscribePlayer(playerId, subscriptionKey).catch(() => undefined);
      }
      return subscribeOnce(playerId);
    },
    updateSnapshot(playerId, updater) {
      const snapshot = snapshotByPlayer.get(playerId);
      if (!snapshot) return;
      const nextSnapshot = updater(snapshot);
      if (nextSnapshot) snapshotByPlayer.set(playerId, nextSnapshot);
    }
  };
};
