export type PlayerSocketLike = {
  OPEN: number;
  readyState: number;
  send: (payload: string) => void;
};

export const controlSocketForPlayer = (
  controlSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  playerId: string
): PlayerSocketLike | undefined => controlSocketsByPlayer.get(playerId);

export const bulkSocketForPlayer = (
  controlSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  bulkSocketsByPlayer: ReadonlyMap<string, PlayerSocketLike>,
  playerId: string
): PlayerSocketLike | undefined => bulkSocketsByPlayer.get(playerId) ?? controlSocketsByPlayer.get(playerId);

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
  for (const socket of bulkSocketsByPlayer.values()) {
    if (socket.readyState !== socket.OPEN || sent.has(socket)) continue;
    socket.send(payload);
    sent.add(socket);
  }
  for (const [playerId, socket] of controlSocketsByPlayer) {
    if (bulkSocketsByPlayer.has(playerId) || socket.readyState !== socket.OPEN || sent.has(socket)) continue;
    socket.send(payload);
    sent.add(socket);
  }
};
