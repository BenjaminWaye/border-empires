export type PlayerSocketLike = {
  OPEN: number;
  readyState: number;
  send: (payload: string) => void;
};

const isOpenSocket = (socket: PlayerSocketLike | undefined): socket is PlayerSocketLike =>
  socket !== undefined && socket.readyState === socket.OPEN;

export const controlSocketForPlayer = (
  controlSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  playerId: string
): PlayerSocketLike | undefined => controlSocketsByPlayer.get(playerId);

export const bulkSocketForPlayer = (
  controlSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  bulkSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  playerId: string
): PlayerSocketLike | undefined => {
  const bulkSocket = bulkSocketsByPlayer.get(playerId);
  if (isOpenSocket(bulkSocket)) return bulkSocket;
  const controlSocket = controlSocketsByPlayer.get(playerId);
  if (isOpenSocket(controlSocket)) return controlSocket;
  return bulkSocket ?? controlSocket;
};

export const sendControlToPlayer = (
  controlSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  playerId: string,
  payload: string
): void => {
  const socket = controlSocketForPlayer(controlSocketsByPlayer, playerId);
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(payload);
};

export const sendBulkToPlayer = (
  controlSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  bulkSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  playerId: string,
  payload: string
): void => {
  const socket = bulkSocketForPlayer(controlSocketsByPlayer, bulkSocketsByPlayer, playerId);
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(payload);
};

export const broadcastBulk = (
  controlSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  bulkSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  payload: string
): void => {
  const sent = new Set<PlayerSocketLike>();
  const playerIds = new Set<string>([...bulkSocketsByPlayer.keys(), ...controlSocketsByPlayer.keys()]);
  for (const playerId of playerIds) {
    const socket = bulkSocketForPlayer(controlSocketsByPlayer, bulkSocketsByPlayer, playerId);
    if (!isOpenSocket(socket) || sent.has(socket)) continue;
    socket.send(payload);
    sent.add(socket);
  }
};

export const detachBulkSocketForPlayer = (
  controlSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  bulkSocketsByPlayer: Map<string, PlayerSocketLike>,
  playerId: string,
  closingSocket: PlayerSocketLike
): {
  closedCurrentBulkSocket: boolean;
  preserveChunkSessionState: boolean;
} => {
  const currentBulkSocket = bulkSocketsByPlayer.get(playerId);
  if (currentBulkSocket !== closingSocket) {
    return {
      closedCurrentBulkSocket: false,
      preserveChunkSessionState: true
    };
  }
  bulkSocketsByPlayer.delete(playerId);
  return {
    closedCurrentBulkSocket: true,
    preserveChunkSessionState: isOpenSocket(controlSocketsByPlayer.get(playerId))
  };
};
