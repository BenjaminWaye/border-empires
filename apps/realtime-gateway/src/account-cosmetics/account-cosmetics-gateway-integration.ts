import { createAccountCosmeticsService, type AccountCosmeticsService } from "./account-cosmetics-service.js";
import { createAccountCosmeticsStore } from "./account-cosmetics-store-factory.js";

// One factory so gateway-app.ts (over the file-line limit and not allowed to
// grow) needs a single call to get the store, the service and the looks that
// were already chosen before this boot.
export const createAccountCosmeticsGatewayIntegration = async <Socket>(
  storeOptions: { sqlitePath?: string; applySchema?: boolean },
  deps: {
    preSerializeBroadcast: (payload: unknown) => unknown;
    allSockets: () => Iterable<Socket>;
    socketsForPlayer: (playerId: string) => Iterable<Socket>;
    queueOrSendSessionPayload: (socket: Socket, payload: unknown) => void;
    log?: (message: string, detail: Record<string, unknown>) => void;
    getCurrentSeasonId?: () => Promise<string | undefined>;
  }
): Promise<AccountCosmeticsService> => {
  const service = createAccountCosmeticsService({
    store: await createAccountCosmeticsStore(storeOptions),
    broadcastToAll: (payload) => {
      // Serialised once and shared by every recipient.
      const serialized = deps.preSerializeBroadcast(payload);
      for (const socket of deps.allSockets()) deps.queueOrSendSessionPayload(socket, serialized);
    },
    sendToPlayer: (playerId, payload) => {
      for (const socket of deps.socketsForPlayer(playerId)) deps.queueOrSendSessionPayload(socket, payload);
    },
    ...(deps.log ? { log: deps.log } : {}),
    ...(deps.getCurrentSeasonId ? { getCurrentSeasonId: deps.getCurrentSeasonId } : {})
  });
  await service.hydrate();
  return service;
};
