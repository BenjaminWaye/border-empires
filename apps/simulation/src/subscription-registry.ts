export type PlayerSubscriptionRegistry = {
  subscribe: (playerId: string, subscriptionKey?: string) => void;
  unsubscribe: (playerId: string, subscriptionKey?: string) => void;
  isSubscribed: (playerId: string) => boolean;
  subscribedPlayerIds: () => string[];
};

type PlayerSubscriptionState = {
  anonymousCount: number;
  keyedCounts: Map<string, number>;
  activeKeyCountByNamespace: Map<string, number>;
  cancelledGenerationByNamespace: Map<string, number>;
  latestNamespace?: string;
};

type ParsedSubscriptionKey = {
  generation: number;
  namespace: string;
};

const parseSubscriptionKey = (subscriptionKey: string): ParsedSubscriptionKey | undefined => {
  const firstSeparator = subscriptionKey.indexOf(":");
  const lastSeparator = subscriptionKey.lastIndexOf(":");
  if (firstSeparator <= 0 || lastSeparator <= firstSeparator) return undefined;
  const namespace = subscriptionKey.slice(0, firstSeparator);
  const generation = Number.parseInt(subscriptionKey.slice(lastSeparator + 1), 10);
  if (!Number.isSafeInteger(generation) || generation <= 0) return undefined;
  return { generation, namespace };
};

const compareNamespaces = (left: string, right: string): number => {
  const leftOrdinal = Number.parseInt(left, 36);
  const rightOrdinal = Number.parseInt(right, 36);
  if (Number.isFinite(leftOrdinal) && Number.isFinite(rightOrdinal) && leftOrdinal !== rightOrdinal) {
    return leftOrdinal - rightOrdinal;
  }
  return left.localeCompare(right);
};

export const createPlayerSubscriptionRegistry = (): PlayerSubscriptionRegistry => {
  const stateByPlayerId = new Map<string, PlayerSubscriptionState>();

  const stateFor = (playerId: string): PlayerSubscriptionState => {
    let state = stateByPlayerId.get(playerId);
    if (!state) {
      state = {
        anonymousCount: 0,
        keyedCounts: new Map<string, number>(),
        activeKeyCountByNamespace: new Map<string, number>(),
        cancelledGenerationByNamespace: new Map<string, number>()
      };
      stateByPlayerId.set(playerId, state);
    }
    return state;
  };

  const updateLatestNamespace = (state: PlayerSubscriptionState, namespace: string): void => {
    if (!state.latestNamespace || compareNamespaces(namespace, state.latestNamespace) > 0) {
      state.latestNamespace = namespace;
    }
  };

  const pruneObsoleteNamespaces = (state: PlayerSubscriptionState): void => {
    if (!state.latestNamespace) return;
    for (const namespace of [...state.cancelledGenerationByNamespace.keys()]) {
      if (compareNamespaces(namespace, state.latestNamespace) >= 0) continue;
      if ((state.activeKeyCountByNamespace.get(namespace) ?? 0) > 0) continue;
      state.cancelledGenerationByNamespace.delete(namespace);
    }
  };

  const cleanup = (playerId: string, state: PlayerSubscriptionState): void => {
    pruneObsoleteNamespaces(state);
    if (state.anonymousCount > 0) return;
    if (state.keyedCounts.size > 0) return;
    if (state.cancelledGenerationByNamespace.size > 0) return;
    stateByPlayerId.delete(playerId);
  };

  return {
    subscribe(playerId, subscriptionKey) {
      const state = stateFor(playerId);
      if (!subscriptionKey) {
        state.anonymousCount += 1;
        return;
      }
      const parsedKey = parseSubscriptionKey(subscriptionKey);
      if (!parsedKey) {
        state.keyedCounts.set(subscriptionKey, (state.keyedCounts.get(subscriptionKey) ?? 0) + 1);
        return;
      }
      updateLatestNamespace(state, parsedKey.namespace);
      if (state.latestNamespace && compareNamespaces(parsedKey.namespace, state.latestNamespace) < 0) {
        cleanup(playerId, state);
        return;
      }
      if ((state.cancelledGenerationByNamespace.get(parsedKey.namespace) ?? 0) >= parsedKey.generation) {
        cleanup(playerId, state);
        return;
      }
      state.keyedCounts.set(subscriptionKey, (state.keyedCounts.get(subscriptionKey) ?? 0) + 1);
      state.activeKeyCountByNamespace.set(parsedKey.namespace, (state.activeKeyCountByNamespace.get(parsedKey.namespace) ?? 0) + 1);
    },
    unsubscribe(playerId, subscriptionKey) {
      const state = stateFor(playerId);
      if (!subscriptionKey) {
        state.anonymousCount = Math.max(0, state.anonymousCount - 1);
        cleanup(playerId, state);
        return;
      }
      const parsedKey = parseSubscriptionKey(subscriptionKey);
      if (!parsedKey) {
        const nextCount = (state.keyedCounts.get(subscriptionKey) ?? 0) - 1;
        if (nextCount > 0) {
          state.keyedCounts.set(subscriptionKey, nextCount);
        } else {
          state.keyedCounts.delete(subscriptionKey);
        }
        cleanup(playerId, state);
        return;
      }
      updateLatestNamespace(state, parsedKey.namespace);
      const nextCount = (state.keyedCounts.get(subscriptionKey) ?? 0) - 1;
      if (nextCount > 0) {
        state.keyedCounts.set(subscriptionKey, nextCount);
        cleanup(playerId, state);
        return;
      }
      if (state.keyedCounts.has(subscriptionKey)) {
        state.keyedCounts.delete(subscriptionKey);
        const nextNamespaceCount = (state.activeKeyCountByNamespace.get(parsedKey.namespace) ?? 0) - 1;
        if (nextNamespaceCount > 0) {
          state.activeKeyCountByNamespace.set(parsedKey.namespace, nextNamespaceCount);
        } else {
          state.activeKeyCountByNamespace.delete(parsedKey.namespace);
        }
      } else {
        const cancelledGeneration = state.cancelledGenerationByNamespace.get(parsedKey.namespace) ?? 0;
        if (parsedKey.generation > cancelledGeneration) {
          state.cancelledGenerationByNamespace.set(parsedKey.namespace, parsedKey.generation);
        }
      }
      cleanup(playerId, state);
    },
    isSubscribed(playerId) {
      const state = stateByPlayerId.get(playerId);
      if (!state) return false;
      cleanup(playerId, state);
      return (stateByPlayerId.get(playerId)?.anonymousCount ?? 0) > 0 || (stateByPlayerId.get(playerId)?.keyedCounts.size ?? 0) > 0;
    },
    subscribedPlayerIds() {
      for (const [playerId, state] of stateByPlayerId.entries()) {
        cleanup(playerId, state);
      }
      return [...stateByPlayerId.entries()]
        .filter(([, state]) => state.anonymousCount > 0 || state.keyedCounts.size > 0)
        .map(([playerId]) => playerId);
    }
  };
};
