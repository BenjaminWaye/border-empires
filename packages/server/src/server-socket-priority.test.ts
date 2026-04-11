import { describe, expect, it, vi } from "vitest";
import {
  enqueueLowPrioritySocketMessage,
  pauseLowPrioritySocketMessages,
  sendHighPrioritySocketMessage
} from "./server-socket-priority.js";

type TestSocket = {
  OPEN: number;
  readyState: number;
  bufferedAmount: number;
  sent: string[];
  send: (payload: string) => void;
};

const createSocket = (): TestSocket => {
  const socket: TestSocket = {
    OPEN: 1,
    readyState: 1,
    bufferedAmount: 0,
    sent: [],
    send(payload: string) {
      socket.sent.push(payload);
    }
  };
  return socket;
};

describe("server socket priority", () => {
  it("sends high priority payloads immediately even when low priority is paused", () => {
    vi.useFakeTimers();
    const socket = createSocket();

    pauseLowPrioritySocketMessages(socket as never, Date.now() + 1_000);
    enqueueLowPrioritySocketMessage(socket as never, "chunk");
    sendHighPrioritySocketMessage(socket as never, "ack");

    expect(socket.sent).toEqual(["ack"]);

    vi.advanceTimersByTime(1_000);
    expect(socket.sent).toEqual(["ack", "chunk"]);
    vi.useRealTimers();
  });

  it("waits for buffered low priority data to drain before sending more chunks", () => {
    vi.useFakeTimers();
    const socket = createSocket();
    socket.bufferedAmount = 200_000;

    enqueueLowPrioritySocketMessage(socket as never, "chunk-a");
    expect(socket.sent).toEqual([]);

    socket.bufferedAmount = 0;
    vi.advanceTimersByTime(25);

    expect(socket.sent).toEqual(["chunk-a"]);
    vi.useRealTimers();
  });
});
