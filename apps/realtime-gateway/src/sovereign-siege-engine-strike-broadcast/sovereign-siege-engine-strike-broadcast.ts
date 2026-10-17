import { preSerializeBroadcast } from "../broadcast-payload/broadcast-payload.js";
import { createSovereignSiegeEngineStrikeStore } from "../sovereign-siege-engine-strike-store-factory/sovereign-siege-engine-strike-store-factory.js";
import { readSovereignSiegeEngineStrikeAnnouncement, type SovereignSiegeEngineStrikeStore } from "../sovereign-siege-engine-strike-store/sovereign-siege-engine-strike-store.js";

export type SovereignSiegeEngineStrikeGatewayIntegration = {
  store: SovereignSiegeEngineStrikeStore;
  // Handles a single __broadcast__ SOVEREIGN_SIEGE_ENGINE_STRIKE_ANNOUNCEMENT
  // PLAYER_MESSAGE event: persists it (12h history) and fans the
  // pre-serialized payload out via the caller-supplied sender. Pulled out of
  // gateway-app.ts (already over this repo's 500-line file-size gate) so the
  // call site there is a single statement.
  handleBroadcastEvent: (payload: Record<string, unknown>, fanOut: (payload: unknown) => void, onPersistError: (error: unknown) => void) => void;
};

export const createSovereignSiegeEngineStrikeGatewayIntegration = async (
  factoryOptions: { sqlitePath?: string; applySchema?: boolean }
): Promise<SovereignSiegeEngineStrikeGatewayIntegration> => {
  const store = await createSovereignSiegeEngineStrikeStore(factoryOptions);
  return {
    store,
    handleBroadcastEvent: (payload, fanOut, onPersistError) => {
      const strike = readSovereignSiegeEngineStrikeAnnouncement(payload);
      if (strike) void store.insert(strike).catch(onPersistError);
      fanOut(preSerializeBroadcast(payload));
    }
  };
};
