import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

export type RawSimulationClient = {
  SubmitCommand?: (
    request: { command_id: string; session_id: string; player_id: string; client_seq: number; issued_at: number; type: string; payload_json: string },
    callback: (error: Error | null, response: { ok: boolean }) => void
  ) => void;
  submitCommand?: (
    request: { command_id: string; session_id: string; player_id: string; client_seq: number; issued_at: number; type: string; payload_json: string },
    callback: (error: Error | null, response: { ok: boolean }) => void
  ) => void;
  PreparePlayer?: (
    request: { player_id: string },
    callback: (error: Error | null, response: { ok: boolean; player_id?: string; spawned?: boolean; joined?: boolean; full?: boolean }) => void
  ) => void;
  preparePlayer?: (
    request: { player_id: string },
    callback: (error: Error | null, response: { ok: boolean; player_id?: string; spawned?: boolean; joined?: boolean; full?: boolean }) => void
  ) => void;
  JoinSeason?: (
    request: { player_id: string },
    callback: (error: Error | null, response: { ok: boolean; player_id?: string; spawned?: boolean; full?: boolean }) => void
  ) => void;
  joinSeason?: (
    request: { player_id: string },
    callback: (error: Error | null, response: { ok: boolean; player_id?: string; spawned?: boolean; full?: boolean }) => void
  ) => void;
  SubscribePlayer?: (
    request: { player_id: string; subscription_json: string },
    callback: (
      error: Error | null,
      response: {
        ok: boolean;
        player_id?: string;
        world_status_json?: string;
        tiles?: Array<{ x: number; y: number; terrain?: string; owner_id?: string; ownership_state?: string }>;
      }
    ) => void
  ) => void;
  subscribePlayer?: (
    request: { player_id: string; subscription_json: string },
    callback: (
      error: Error | null,
      response: {
        ok: boolean;
        player_id?: string;
        world_status_json?: string;
        tiles?: Array<{ x: number; y: number; terrain?: string; owner_id?: string; ownership_state?: string }>;
      }
    ) => void
  ) => void;
  UnsubscribePlayer?: (request: { player_id: string }, callback: (error: Error | null, response: { ok: boolean }) => void) => void;
  unsubscribePlayer?: (request: { player_id: string }, callback: (error: Error | null, response: { ok: boolean }) => void) => void;
  StreamEvents?: (request: { at: number }) => { on: (event: "data" | "error", handler: (value: any) => void) => void; cancel: () => void };
  streamEvents?: (request: { at: number }) => { on: (event: "data" | "error", handler: (value: any) => void) => void; cancel: () => void };
};

const packageDefinition = loadSync(fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)), {
  keepCase: true,
  longs: Number,
  defaults: true,
  enums: String,
  oneofs: false
});

const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: {
    simulation: {
      SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => RawSimulationClient;
    };
  };
};

export const createRawSimulationClient = (address: string): RawSimulationClient =>
  new proto.border_empires.simulation.SimulationService(address, credentials.createInsecure());

export const preparePlayer = async (
  client: RawSimulationClient,
  playerId: string
): Promise<{ playerId: string; spawned: boolean; joined: boolean; full: boolean }> => {
  const rpc = client.PreparePlayer ?? client.preparePlayer;
  if (!rpc) throw new Error("PreparePlayer RPC unavailable in integration test");
  return await new Promise((resolve, reject) => {
    rpc.call(client, { player_id: playerId }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        playerId: response.player_id ?? playerId,
        spawned: response.spawned === true,
        joined: response.joined !== false,
        full: response.full === true
      });
    });
  });
};

export const joinSeason = async (
  client: RawSimulationClient,
  playerId: string
): Promise<{ playerId: string; spawned: boolean; full: boolean }> => {
  const rpc = client.JoinSeason ?? client.joinSeason;
  if (!rpc) throw new Error("JoinSeason RPC unavailable in integration test");
  return await new Promise((resolve, reject) => {
    rpc.call(client, { player_id: playerId }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        playerId: response.player_id ?? playerId,
        spawned: response.spawned === true,
        full: response.full === true
      });
    });
  });
};

export const subscribePlayer = async (
  client: RawSimulationClient,
  playerId: string,
  subscriptionJson = "{}"
): Promise<{ playerId: string; tiles: Array<{ x: number; y: number; terrain?: string; ownerId?: string; ownershipState?: string }>; worldStatus?: { leaderboard: { overall: unknown[] } } }> => {
  const rpc = client.SubscribePlayer ?? client.subscribePlayer;
  if (!rpc) throw new Error("SubscribePlayer RPC unavailable in integration test");
  return await new Promise((resolve, reject) => {
    rpc.call(client, { player_id: playerId, subscription_json: subscriptionJson }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        playerId: response.player_id ?? playerId,
        tiles: (response.tiles ?? []).map((tile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.owner_id ? { ownerId: tile.owner_id } : {}),
          ...(tile.ownership_state ? { ownershipState: tile.ownership_state } : {})
        })),
        ...(response.world_status_json ? { worldStatus: JSON.parse(response.world_status_json) as { leaderboard: { overall: unknown[] } } } : {})
      });
    });
  });
};

export const silentLog = {
  info: () => undefined,
  error: () => undefined
};
