export type PlayerSubscriptionRegistry = {
  subscribe: (playerId: string) => void;
  unsubscribe: (playerId: string) => void;
  isSubscribed: (playerId: string) => boolean;
  subscribedPlayerIds: () => string[];
};

export const createPlayerSubscriptionRegistry = (): PlayerSubscriptionRegistry => {
  const subscribedPlayers = new Set<string>();

  return {
    subscribe(playerId) {
      subscribedPlayers.add(playerId);
    },
    unsubscribe(playerId) {
      subscribedPlayers.delete(playerId);
    },
    isSubscribed(playerId) {
      return subscribedPlayers.has(playerId);
    },
    subscribedPlayerIds() {
      return [...subscribedPlayers];
    }
  };
};
