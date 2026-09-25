/** Progress of a chunked INIT transfer (see shared init-transfer.ts). */
export type InitTransferProgress = {
  /** "downloading" while frames arrive; "building" once reassembled, just before INIT is handled. */
  phase: "downloading" | "building";
  receivedChars: number;
  totalChars: number;
};

export type RealtimeSocketEventMap = {
  open: Event;
  close: CloseEvent;
  error: Event;
  message: MessageEvent<string>;
  initprogress: CustomEvent<InitTransferProgress>;
};

export interface RealtimeSocket {
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSING: 2;
  readonly CLOSED: 3;
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  /** Reopens fresh underlying connection(s) in place; callers should only call this when readyState !== OPEN. */
  reconnect(): void;
  addEventListener<K extends keyof RealtimeSocketEventMap>(
    type: K,
    listener: (event: RealtimeSocketEventMap[K]) => void
  ): void;
  removeEventListener<K extends keyof RealtimeSocketEventMap>(
    type: K,
    listener: (event: RealtimeSocketEventMap[K]) => void
  ): void;
}
