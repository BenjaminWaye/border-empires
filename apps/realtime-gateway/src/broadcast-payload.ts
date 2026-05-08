// Pre-serialized broadcast payload: when the same JSON message fans out to
// many sockets, we stringify once and reuse the string instead of paying
// JSON.stringify per socket.

export class BroadcastPayload {
  constructor(
    readonly serialized: string,
    readonly source: unknown
  ) {}
}

export const preSerializeBroadcast = (payload: unknown): BroadcastPayload =>
  payload instanceof BroadcastPayload ? payload : new BroadcastPayload(JSON.stringify(payload), payload);

export const unwrapPayloadSource = (payload: unknown): unknown =>
  payload instanceof BroadcastPayload ? payload.source : payload;

export const sendJsonToSocket = (
  socket: { readyState: number; OPEN: number; send: (data: string) => void },
  payload: unknown
): void => {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(payload instanceof BroadcastPayload ? payload.serialized : JSON.stringify(payload));
};
