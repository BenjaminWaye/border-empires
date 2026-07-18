type SocketLike = {
  readonly readyState: number;
  readonly OPEN: number;
};

type SocketSession = {
  playerId?: string;
  channel: "control" | "bulk";
};

type EventType = "COMMAND_ACCEPTED" | "COMMAND_REJECTED" | "COMMAND_RESOLVED" | "COMBAT_CANCELLED" | "COMBAT_RESOLVED" | "TILE_DELTA_BATCH" | "PLAYER_MESSAGE" | "COLLECT_RESULT" | "TECH_UPDATE" | "DOMAIN_UPDATE";

const isOpenSocket = <TSocket extends SocketLike>(socket: TSocket): boolean => socket.readyState === socket.OPEN;

export const selectSocketsForEvent = <TSocket extends SocketLike>(
  sockets: ReadonlySet<TSocket>,
  eventType: EventType,
  getSession: (socket: TSocket) => SocketSession | undefined
): TSocket[] => {
  const controlSockets: TSocket[] = [];
  const bulkSockets: TSocket[] = [];
  for (const socket of sockets) {
    if (!isOpenSocket(socket)) continue;
    const session = getSession(socket);
    if (!session) continue;
    if (session.channel === "bulk") bulkSockets.push(socket);
    else controlSockets.push(socket);
  }
  if (eventType === "TILE_DELTA_BATCH") return bulkSockets.length > 0 ? bulkSockets : controlSockets;
  return controlSockets.length > 0 ? controlSockets : bulkSockets;
};

export const selectSocketsForTileDeltaBatchByPlayer = <TSocket extends SocketLike>(
  sockets: ReadonlySet<TSocket>,
  getSession: (socket: TSocket) => SocketSession | undefined
): TSocket[] => {
  const socketsByPlayerId = new Map<
    string,
    { control: TSocket[]; bulk: TSocket[] }
  >();
  for (const socket of sockets) {
    if (!isOpenSocket(socket)) continue;
    const session = getSession(socket);
    if (!session?.playerId) continue;
    const grouped = socketsByPlayerId.get(session.playerId) ?? { control: [], bulk: [] };
    if (session.channel === "bulk") grouped.bulk.push(socket);
    else grouped.control.push(socket);
    socketsByPlayerId.set(session.playerId, grouped);
  }
  const selected: TSocket[] = [];
  for (const grouped of socketsByPlayerId.values()) {
    selected.push(...(grouped.bulk.length > 0 ? grouped.bulk : grouped.control));
  }
  return selected;
};
