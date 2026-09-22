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

export class GameSession {
  private nextClientSeq = 1;
  private readonly pending = new Map<
    string,
    { resolve: (result: CommandResult) => void; timeoutId: NodeJS.Timeout }
  >();

  private constructor(private readonly socket: WebSocket, readonly initState: GameInitState) {
    this.socket.on("message", (data) => this.handleMessage(data));
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
      this.pending.set(commandId, { resolve, timeoutId });
      this.socket.send(JSON.stringify(validated));
    });
  }

  close(): void {
    this.socket.close();
  }
}
