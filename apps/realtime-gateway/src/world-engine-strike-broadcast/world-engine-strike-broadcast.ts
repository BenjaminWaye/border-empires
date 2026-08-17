import { preSerializeBroadcast } from "../broadcast-payload/broadcast-payload.js";
import { createWorldEngineStrikeStore } from "../world-engine-strike-store-factory/world-engine-strike-store-factory.js";
import { readWorldEngineStrikeAnnouncement, type WorldEngineStrikeStore } from "../world-engine-strike-store/world-engine-strike-store.js";

export type WorldEngineStrikeGatewayIntegration = {
  store: WorldEngineStrikeStore;
  // Handles a single __broadcast__ WORLD_ENGINE_STRIKE_ANNOUNCEMENT
  // PLAYER_MESSAGE event: persists it (12h history) and fans the
  // pre-serialized payload out via the caller-supplied sender. Pulled out of
  // gateway-app.ts (already over this repo's 500-line file-size gate) so the
  // call site there is a single statement.
  handleBroadcastEvent: (payload: Record<string, unknown>, fanOut: (payload: unknown) => void, onPersistError: (error: unknown) => void) => void;
};

export const createWorldEngineStrikeGatewayIntegration = async (
  factoryOptions: { sqlitePath?: string; applySchema?: boolean }
): Promise<WorldEngineStrikeGatewayIntegration> => {
  const store = await createWorldEngineStrikeStore(factoryOptions);
  return {
    store,
    handleBroadcastEvent: (payload, fanOut, onPersistError) => {
      const strike = readWorldEngineStrikeAnnouncement(payload);
      if (strike) void store.insert(strike).catch(onPersistError);
      fanOut(preSerializeBroadcast(payload));
    }
  };
};
