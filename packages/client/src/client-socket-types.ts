export type RealtimeSocketEventMap = {
  open: Event;
  close: CloseEvent;
  error: Event;
  message: MessageEvent<string>;
};

export interface RealtimeSocket {
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSING: 2;
  readonly CLOSED: 3;
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener<K extends keyof RealtimeSocketEventMap>(
    type: K,
    listener: (event: RealtimeSocketEventMap[K]) => void
  ): void;
  removeEventListener<K extends keyof RealtimeSocketEventMap>(
    type: K,
    listener: (event: RealtimeSocketEventMap[K]) => void
  ): void;
}
