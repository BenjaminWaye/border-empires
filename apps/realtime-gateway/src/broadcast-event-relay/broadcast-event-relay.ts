import type { SimulationClientEvent } from "../sim-client/sim-client.js";
import { jsonSafeTileDeltaBatch } from "../gateway-bootstrap-helpers/gateway-bootstrap-helpers.js";
import { isSeasonRolloverEvent, scheduleSeasonRolloverResync } from "../season-rollover-resync/season-rollover-resync.js";

type RelaySocket = { readonly readyState: number; readonly OPEN: number; close: (code: number, reason: string) => void };

export type BroadcastEventRelayDeps<TSocket extends RelaySocket> = {
  allSockets: () => Iterable<TSocket>;
  socketGroups: () => Iterable<Iterable<TSocket>>;
  sendToSocket: (socket: TSocket, payload: unknown) => void;
  preSerializeBroadcast: (payload: unknown) => unknown;
  recordGatewayEvent: (level: "info", event: string, payload: Record<string, unknown>) => void;
  countSeasonRolloverResyncSockets: (count: number) => void;
};

// Simulation events that are for every connected player rather than one: the
// map-wide tile delta (player id "__broadcast__") and the season rollover (no
// player id). Returns true when the event was one of these and has been
// handled, so the caller must not route it per player.
export const relaySimulationBroadcastEvent = <TSocket extends RelaySocket>(
  event: SimulationClientEvent,
  deps: BroadcastEventRelayDeps<TSocket>
): boolean => {
  if (event.playerId === "__broadcast__" && event.eventType === "TILE_DELTA_BATCH") {
    const payload = deps.preSerializeBroadcast({
      type: "TILE_DELTA_BATCH",
      commandId: event.commandId,
      tiles: jsonSafeTileDeltaBatch(event.tileDeltas)
    });
    for (const socket of deps.allSockets()) deps.sendToSocket(socket, payload);
    return true;
  }
  if (isSeasonRolloverEvent(event)) {
    // The new world is up: tell each client when its socket will close, so the
    // season-end screen can say "World ready · joining in Ns" instead of a bare spinner.
    const sockets = scheduleSeasonRolloverResync(deps.socketGroups(), {
      notify: (socket, reconnectInMs) => deps.sendToSocket(socket, { type: "SEASON_ROLLOVER_READY", reconnectInMs })
    });
    deps.countSeasonRolloverResyncSockets(sockets);
    deps.recordGatewayEvent("info", "gateway_season_rollover_resync_scheduled", { commandId: event.commandId, sockets });
    return true;
  }
  return false;
};
