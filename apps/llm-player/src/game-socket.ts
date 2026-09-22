// Thin WebSocket client for the existing gateway protocol — connects exactly
// like the real browser client does (AUTH -> INIT), just without a UI. Based
// on the connection pattern in scripts/rewrite-local-soak.mjs, the repo's
// existing non-browser WS bot.
//
// The INIT message itself has no shared exported type (it's assembled ad hoc
// by apps/realtime-gateway/src/init-payload/init-payload.ts for display
// purposes), so it's read defensively here rather than cast to a strict type.
import WebSocket from "ws";
import { ClientMessageSchema, type ClientMessage } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

export type GameTile = PlayerSubscriptionSnapshot["tiles"][number];

export type GameInitState = {
  playerId: string;
  playerName: string;
  gold: number;
  manpower: number;
  tiles: GameTile[];
};

export type BotAction =
  | { type: "EXPAND"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "ATTACK"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "SETTLE"; x: number; y: number };

export type CommandResult = { outcome: "accepted" } | { outcome: "error"; code: string; message: string };

const CONNECT_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 15_000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export const tileKey = (x: number, y: number): string => `${x},${y}`;

const parseInitState = (message: Record<string, unknown>): GameInitState => {
  const player = isRecord(message.player) ? message.player : {};
  const initialState = isRecord(message.initialState) ? message.initialState : {};
  const tiles = Array.isArray(initialState.tiles) ? (initialState.tiles as GameTile[]) : [];
  return {
    playerId: typeof player.id === "string" ? player.id : "",
    playerName: typeof player.name === "string" ? player.name : "",
    gold: typeof player.gold === "number" ? player.gold : 0,
    manpower: typeof player.manpower === "number" ? player.manpower : 0,
    tiles
  };
};

// TILE_DELTA_BATCH entries are partial patches keyed by x/y (see
// scripts/rewrite-local-soak.mjs's normalizeTile/tileKey, the repo's other
// non-browser WS client, which merges them the same way) -- everything past
// x/y is optional and merged onto whatever tile state is already known.
type TileDelta = { x: number; y: number } & Partial<GameTile>;

const asTileDelta = (value: unknown): TileDelta | undefined => {
  if (!isRecord(value) || typeof value.x !== "number" || typeof value.y !== "number") return undefined;
  return value as TileDelta;
};

export class GameSession {
  private nextClientSeq = 1;
  private readonly pending = new Map<
    string,
    { resolve: (result: CommandResult) => void; reject: (error: Error) => void; timeoutId: NodeJS.Timeout }
  >();
  private readonly tiles = new Map<string, GameTile>();
  private player: { id: string; name: string; gold: number; manpower: number };
  // Set once the connection is confirmed gone (clean close or socket error)
  // so a bot meant to run unattended (cron/launchd, per README) fails each
  // remaining turn immediately instead of silently sitting through a full
  // COMMAND_TIMEOUT_MS per turn against a dead connection.
  private connectionError: Error | undefined;

  private constructor(
    private readonly socket: WebSocket,
    init: GameInitState
  ) {
    this.player = { id: init.playerId, name: init.playerName, gold: init.gold, manpower: init.manpower };
    for (const tile of init.tiles) this.tiles.set(tileKey(tile.x, tile.y), tile);
    this.socket.on("message", (data) => this.handleMessage(data));
    this.socket.on("close", () => this.handleDisconnect(new Error("Gateway connection closed")));
    // ws throws if an "error" event has no listener at all -- this one is
    // required, not just informative, once we're past the connect() phase's
    // own (temporary) "error" listener.
    this.socket.on("error", (error) => this.handleDisconnect(error instanceof Error ? error : new Error(String(error))));
  }

  isClosed(): boolean {
    return this.connectionError !== undefined;
  }

  private handleDisconnect(error: Error): void {
    if (this.connectionError) return;
    this.connectionError = error;
    for (const { reject, timeoutId } of this.pending.values()) {
      clearTimeout(timeoutId);
      reject(error);
    }
    this.pending.clear();
  }

  // Live snapshot, not the frozen INIT payload -- reflects every
  // TILE_DELTA_BATCH/PLAYER_UPDATE received so far this connection. Call
  // this fresh each turn rather than caching its result.
  currentState(): GameInitState {
    return {
      playerId: this.player.id,
      playerName: this.player.name,
      gold: this.player.gold,
      manpower: this.player.manpower,
      tiles: [...this.tiles.values()]
    };
  }

  static connect(wsUrl: string, idToken: string): Promise<GameSession> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      const timeoutId = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out waiting for INIT from gateway"));
      }, CONNECT_TIMEOUT_MS);

      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "AUTH", token: idToken }));
      });

      const onFirstMessage = (data: WebSocket.RawData) => {
        const message: unknown = JSON.parse(data.toString());
        if (!isRecord(message)) return;
        if (message.type === "ERROR") {
          clearTimeout(timeoutId);
          socket.off("message", onFirstMessage);
          reject(new Error(`Gateway rejected AUTH: ${String(message.code ?? message.message ?? "unknown error")}`));
          return;
        }
        if (message.type !== "INIT") return;
        clearTimeout(timeoutId);
        socket.off("message", onFirstMessage);
        resolve(new GameSession(socket, parseInitState(message)));
      };
      socket.on("message", onFirstMessage);

      socket.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  private handleMessage(data: WebSocket.RawData): void {
    const message: unknown = JSON.parse(data.toString());
    if (!isRecord(message)) return;

    if (message.type === "TILE_DELTA_BATCH" && Array.isArray(message.tiles)) {
      for (const raw of message.tiles) {
        const delta = asTileDelta(raw);
        if (!delta) continue;
        const key = tileKey(delta.x, delta.y);
        const existing = this.tiles.get(key) ?? ({ x: delta.x, y: delta.y } as GameTile);
        this.tiles.set(key, { ...existing, ...delta });
      }
    }
    if (message.type === "PLAYER_UPDATE") {
      if (typeof message.gold === "number") this.player.gold = message.gold;
      if (typeof message.manpower === "number") this.player.manpower = message.manpower;
      if (typeof message.name === "string") this.player.name = message.name;
    }

    const commandId = typeof message.commandId === "string" ? message.commandId : undefined;
    if (!commandId) return;
    const pending = this.pending.get(commandId);
    if (!pending) return;

    if (message.type === "ACTION_ACCEPTED") {
      clearTimeout(pending.timeoutId);
      this.pending.delete(commandId);
      pending.resolve({ outcome: "accepted" });
      return;
    }
    if (message.type === "ERROR") {
      clearTimeout(pending.timeoutId);
      this.pending.delete(commandId);
      pending.resolve({
        outcome: "error",
        code: typeof message.code === "string" ? message.code : "UNKNOWN",
        message: typeof message.message === "string" ? message.message : ""
      });
    }
  }

  sendAction(action: BotAction): Promise<CommandResult> {
    if (this.connectionError) return Promise.reject(this.connectionError);

    const commandId = `llm-player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientSeq = this.nextClientSeq;
    this.nextClientSeq += 1;

    const candidate: ClientMessage = { ...action, commandId, clientSeq };
    const validated = ClientMessageSchema.parse(candidate);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(commandId);
        reject(new Error(`Timed out waiting for a response to ${action.type}`));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(commandId, { resolve, reject, timeoutId });
      this.socket.send(JSON.stringify(validated));
    });
  }

  close(): void {
    this.socket.close();
  }
}
