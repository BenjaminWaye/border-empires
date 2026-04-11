import type { RealtimeSocket, RealtimeSocketEventMap } from "./client-socket-types.js";

type Channel = "control" | "bulk";

const bulkOnlyMessageTypes = new Set([
  "SUBSCRIBE_CHUNKS",
  "REQUEST_TILE_DETAIL",
  "SET_FOG_DISABLED"
]);

const parseMessageType = (payload: string): string | undefined => {
  try {
    const parsed = JSON.parse(payload) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : undefined;
  } catch {
    return undefined;
  }
};

const channelUrl = (baseUrl: string, channel: Channel): string => {
  const url = new URL(baseUrl);
  url.searchParams.set("channel", channel);
  return url.toString();
};

export const createMultiplexWebSocket = (baseUrl: string): RealtimeSocket => {
  const controlSocket = new WebSocket(channelUrl(baseUrl, "control"));
  const bulkSocket = new WebSocket(channelUrl(baseUrl, "bulk"));
  const eventTarget = new EventTarget();
  let readyState: number = WebSocket.CONNECTING;
  let syntheticOpenDispatched = false;
  let syntheticClosed = false;
  let latestAuthPayload: string | undefined;

  const maybeDispatchOpen = (): void => {
    if (syntheticOpenDispatched) return;
    if (controlSocket.readyState !== WebSocket.OPEN) return;
    readyState = WebSocket.OPEN;
    syntheticOpenDispatched = true;
    eventTarget.dispatchEvent(new Event("open"));
  };

  const closeUnderlyingSockets = (code?: number, reason?: string): void => {
    if (controlSocket.readyState === WebSocket.OPEN || controlSocket.readyState === WebSocket.CONNECTING) controlSocket.close(code, reason);
    if (bulkSocket.readyState === WebSocket.OPEN || bulkSocket.readyState === WebSocket.CONNECTING) bulkSocket.close(code, reason);
  };

  const dispatchClose = (event: CloseEvent): void => {
    if (syntheticClosed) return;
    syntheticClosed = true;
    readyState = WebSocket.CLOSED;
    eventTarget.dispatchEvent(new CloseEvent("close", { code: event.code, reason: event.reason, wasClean: event.wasClean }));
  };

  const maybeSyncBulkAuth = (): void => {
    if (!latestAuthPayload || bulkSocket.readyState !== WebSocket.OPEN) return;
    bulkSocket.send(latestAuthPayload);
  };

  const bindChannelSocket = (socket: WebSocket): void => {
    socket.addEventListener("open", maybeDispatchOpen);
    socket.addEventListener("open", () => {
      if (socket === bulkSocket) maybeSyncBulkAuth();
    });
    socket.addEventListener("message", (event) => {
      eventTarget.dispatchEvent(new MessageEvent<string>("message", { data: String(event.data) }));
    });
    socket.addEventListener("error", () => {
      eventTarget.dispatchEvent(new Event("error"));
    });
    socket.addEventListener("close", (event) => {
      if (!syntheticClosed) {
        readyState = WebSocket.CLOSING;
        closeUnderlyingSockets(event.code || undefined, event.reason || undefined);
      }
      dispatchClose(event);
    });
  };

  bindChannelSocket(controlSocket);
  bindChannelSocket(bulkSocket);

  const sendOnChannel = (channel: Channel, payload: string, allowControlFallback = true): void => {
    const socket = channel === "control" ? controlSocket : bulkSocket;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
      return;
    }
    if (allowControlFallback && channel === "bulk" && controlSocket.readyState === WebSocket.OPEN) {
      controlSocket.send(payload);
    }
  };

  const proxy: RealtimeSocket = {
    CONNECTING: WebSocket.CONNECTING,
    OPEN: WebSocket.OPEN,
    CLOSING: WebSocket.CLOSING,
    CLOSED: WebSocket.CLOSED,
    get readyState() {
      return readyState;
    },
    send(data: string) {
      const messageType = parseMessageType(data);
      if (messageType === "AUTH") {
        latestAuthPayload = data;
        sendOnChannel("control", data);
        sendOnChannel("bulk", data, false);
        return;
      }
      sendOnChannel(bulkOnlyMessageTypes.has(messageType ?? "") ? "bulk" : "control", data);
    },
    close(code?: number, reason?: string) {
      if (syntheticClosed) return;
      readyState = WebSocket.CLOSING;
      closeUnderlyingSockets(code, reason);
    },
    addEventListener(type, listener) {
      eventTarget.addEventListener(type, listener as EventListener);
    },
    removeEventListener(type, listener) {
      eventTarget.removeEventListener(type, listener as EventListener);
    }
  };

  return proxy;
};
