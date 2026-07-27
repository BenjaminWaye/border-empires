import type { RealtimeSocket, RealtimeSocketEventMap } from "../client-socket-types.js";

type Channel = "control" | "bulk";

const bulkOnlyMessageTypes = new Set([
  "SUBSCRIBE_CHUNKS",
  "REQUEST_TILE_DETAIL",
  "REQUEST_REVEAL_MAP",
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

const isSendableCloseCode = (code: number | undefined): code is number =>
  code === 1000 || (typeof code === "number" && code >= 3000 && code <= 4999);

export const createMultiplexWebSocket = (baseUrl: string): RealtimeSocket => {
  const eventTarget = new EventTarget();
  let readyState: number = WebSocket.CONNECTING;
  let syntheticOpenDispatched = false;
  let syntheticClosed = false;
  let latestAuthPayload: string | undefined;
  // Bumped on every reconnect() so listeners bound to a superseded pair of
  // sockets (e.g. a belated "close" from the socket reconnect() just tore
  // down) can tell they're stale and ignore the event instead of corrupting
  // the new generation's readyState/open-dispatch bookkeeping.
  let generation = 0;
  let controlSocket: WebSocket;
  let bulkSocket: WebSocket;

  const maybeDispatchOpen = (): void => {
    if (syntheticOpenDispatched) return;
    if (controlSocket.readyState !== WebSocket.OPEN) return;
    readyState = WebSocket.OPEN;
    syntheticOpenDispatched = true;
    eventTarget.dispatchEvent(new Event("open"));
  };

  const closeUnderlyingSockets = (code?: number, reason?: string): void => {
    const closeSocket = (socket: WebSocket): void => {
      if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) return;
      if (isSendableCloseCode(code)) {
        socket.close(code, reason);
        return;
      }
      socket.close();
    };

    closeSocket(controlSocket);
    closeSocket(bulkSocket);
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

  const bindChannelSocket = (socket: WebSocket, socketGeneration: number, isBulk: boolean): void => {
    socket.addEventListener("open", () => {
      if (socketGeneration !== generation) return;
      maybeDispatchOpen();
      if (isBulk) maybeSyncBulkAuth();
    });
    socket.addEventListener("message", (event) => {
      if (socketGeneration !== generation) return;
      eventTarget.dispatchEvent(new MessageEvent<string>("message", { data: String(event.data) }));
    });
    socket.addEventListener("error", () => {
      if (socketGeneration !== generation) return;
      eventTarget.dispatchEvent(new Event("error"));
    });
    socket.addEventListener("close", (event) => {
      if (socketGeneration !== generation) return;
      if (!syntheticClosed) {
        readyState = WebSocket.CLOSING;
        closeUnderlyingSockets(event.code || undefined, event.reason || undefined);
      }
      dispatchClose(event);
    });
  };

  const createChannelSocket = (channel: Channel): WebSocket => {
    const socket = new WebSocket(channelUrl(baseUrl, channel));
    bindChannelSocket(socket, generation, channel === "bulk");
    return socket;
  };

  controlSocket = createChannelSocket("control");
  bulkSocket = createChannelSocket("bulk");

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
    reconnect() {
      generation += 1;
      try {
        controlSocket.close();
      } catch {
        // Already closed/closing — nothing to release.
      }
      try {
        bulkSocket.close();
      } catch {
        // Already closed/closing — nothing to release.
      }
      syntheticOpenDispatched = false;
      syntheticClosed = false;
      readyState = WebSocket.CONNECTING;
      controlSocket = createChannelSocket("control");
      bulkSocket = createChannelSocket("bulk");
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
