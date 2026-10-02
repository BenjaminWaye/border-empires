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
import type {
  BotAction,
  DomainState,
  CommandResult,
  EventLogEntry,
  FireAndForgetAction,
  GameInitState,
  GameTile,
  ResourceSlots,
  UnmatchedError
} from "./game-types.js";
import { sleep } from "./sleep.js";
import {
  asAutoSettlementQueue,
  asEventLogEntry,
  asResourceSlots,
  asTechIds,
  emptyDomainState,
  isRecord,
  mergeDomainState,
  tileKey
} from "./wire-parsers.js";

const MAX_UNMATCHED_ERRORS = 20;
const MAX_SEEN_REJECTION_IDS = 100;
const OWN_COMMAND_ID_PREFIX = "llm-player-";

const CONNECT_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 15_000;
const JOIN_SEASON_TIMEOUT_MS = 15_000;
// JOIN_SEASON_ACK only carries a coordinate hint (spawnTile), not tile data
// -- the actual owned tile arrives via a separate, not-strictly-ordered
// TILE_DELTA_BATCH (see apps/realtime-gateway/src/gateway-app/handle-join-
// season-message.ts and packages/client/src/client-tile-delta-batch-handler
// .ts's hasOwnedTileInCache check, the real client's equivalent signal).
// Give it a moment to land before the caller reads currentState().
const SPAWN_SETTLE_MS = 1_000;

const parseInitState = (message: Record<string, unknown>): GameInitState => {
  const player = isRecord(message.player) ? message.player : {};
  const initialState = isRecord(message.initialState) ? message.initialState : {};
  const tiles = Array.isArray(initialState.tiles) ? (initialState.tiles as GameTile[]) : [];
  // The curated INIT `player` display object (built by
  // apps/realtime-gateway/src/init-payload/init-payload.ts) doesn't carry
  // eventLog forward -- only the raw snapshot under `initialState.player`
  // does, per packages/sim-protocol/src/index.ts's PlayerSubscriptionSnapshot.
  const rawPlayer = isRecord(initialState.player) ? initialState.player : {};
  const eventLog = Array.isArray(rawPlayer.eventLog)
    ? rawPlayer.eventLog.map(asEventLogEntry).filter((entry): entry is EventLogEntry => entry !== undefined)
    : [];
  return {
    playerId: typeof player.id === "string" ? player.id : "",
    playerName: typeof player.name === "string" ? player.name : "",
    gold: typeof player.gold === "number" ? player.gold : 0,
    manpower: typeof player.manpower === "number" ? player.manpower : 0,
    manpowerCap: typeof player.manpowerCap === "number" ? player.manpowerCap : 0,
    manpowerRegenPerMinute: typeof player.manpowerRegenPerMinute === "number" ? player.manpowerRegenPerMinute : 0,
    tiles,
    eventLog,
    autoSettlementQueue: asAutoSettlementQueue(rawPlayer.autoSettlementQueue),
    techIds: asTechIds(rawPlayer.techIds),
    resourceSlots: asResourceSlots(rawPlayer.resourceSlots),
    // domainChoices/domainCatalog sit at the top level of INIT; domainIds and
    // strategicResources on the curated `player` object.
    domains: mergeDomainState(mergeDomainState(emptyDomainState(), message), { ...rawPlayer, ...player })
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
  private eventLog: EventLogEntry[];
  private autoSettlementQueue: Array<{ x: number; y: number }>;
  private techIds: string[];
  private resourceSlots: ResourceSlots;
  private domains: DomainState;
  private unmatchedErrors: UnmatchedError[] = [];
  private readonly seenRejectionIds = new Set<string>();
  private player: { id: string; name: string; gold: number; manpower: number; manpowerCap: number; manpowerRegenPerMinute: number };
  // Set once the connection is confirmed gone (clean close or socket error)
  // so a bot meant to run unattended (cron/launchd, per README) fails each
  // remaining turn immediately instead of silently sitting through a full
  // COMMAND_TIMEOUT_MS per turn against a dead connection.
  private connectionError: Error | undefined;

  private constructor(
    private readonly socket: WebSocket,
    init: GameInitState
  ) {
    this.player = {
      id: init.playerId,
      name: init.playerName,
      gold: init.gold,
      manpower: init.manpower,
      manpowerCap: init.manpowerCap,
      manpowerRegenPerMinute: init.manpowerRegenPerMinute
    };
    for (const tile of init.tiles) this.tiles.set(tileKey(tile.x, tile.y), tile);
    this.eventLog = init.eventLog;
    this.autoSettlementQueue = init.autoSettlementQueue;
    this.techIds = init.techIds;
    this.resourceSlots = init.resourceSlots;
    this.domains = init.domains;
    this.socket.on("message", (data) => this.handleMessage(data));
    this.socket.on("close", () => this.handleDisconnect(new Error("Gateway connection closed")));
    // ws throws if an "error" event has no listener at all -- this one is
    // required, not just informative, once we're past the connect() phase's
    // own (temporary) "error" listener.
    this.socket.on("error", (error) => this.handleDisconnect(error instanceof Error ? error : new Error(String(error))));
  }

  // BUILD_ECONOMIC_STRUCTURE/CHOOSE_TECH/CHOOSE_DOMAIN carry no client commandId, so the
  // gateway tags their rejection ERROR with a server-generated one
  // (apps/realtime-gateway/src/gateway-app/gateway-app.ts's COMMAND_REJECTED
  // branch) that nothing here is waiting on. Keep those -- bounded -- so the
  // intent ledger can attribute them. Only ERRORs that carry a foreign
  // commandId are rejections of a command: gateway-level ERRORs with none
  // (COMMAND_RATE_LIMITED, BAD_MSG, SERVER_STARTING, ...) say nothing about
  // which command failed and must not be pinned on a pending build or tech.
  // A late ERROR for one of our own sendAction ids (already timed out) isn't
  // one of these either, and a repeated delivery of the same rejection is
  // counted once.
  private recordUnmatchedError(message: Record<string, unknown>, commandId: string | undefined): void {
    if (message.type !== "ERROR" || !commandId) return;
    if (commandId.startsWith(OWN_COMMAND_ID_PREFIX)) return;
    if (this.seenRejectionIds.has(commandId)) return;
    this.seenRejectionIds.add(commandId);
    if (this.seenRejectionIds.size > MAX_SEEN_REJECTION_IDS) {
      const oldest = this.seenRejectionIds.values().next().value;
      if (oldest !== undefined) this.seenRejectionIds.delete(oldest);
    }
    this.unmatchedErrors.push({
      commandId,
      receivedAt: Date.now(),
      code: typeof message.code === "string" ? message.code : "UNKNOWN",
      message: typeof message.message === "string" ? message.message : ""
    });
    if (this.unmatchedErrors.length > MAX_UNMATCHED_ERRORS) this.unmatchedErrors.splice(0, this.unmatchedErrors.length - MAX_UNMATCHED_ERRORS);
  }

  // Returns and clears everything captured since the last call.
  drainUnmatchedErrors(): UnmatchedError[] {
    const drained = this.unmatchedErrors;
    this.unmatchedErrors = [];
    return drained;
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
      manpowerCap: this.player.manpowerCap,
      manpowerRegenPerMinute: this.player.manpowerRegenPerMinute,
      tiles: [...this.tiles.values()],
      eventLog: this.eventLog,
      autoSettlementQueue: this.autoSettlementQueue,
      techIds: this.techIds,
      resourceSlots: this.resourceSlots,
      domains: this.domains
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

      const onConnectError = (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      };

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
        // This connect()-scoped error listener has done its job (bootstrap
        // failures); GameSession's own constructor attaches a permanent one
        // (handleDisconnect) that covers everything from here on, including
        // during the join-season wait below -- without this `off`, both
        // would fire on a later error and the first (this one) would settle
        // the outer promise while joinSeasonAndWaitForSpawn's listener/timer
        // dangles for up to JOIN_SEASON_TIMEOUT_MS more.
        socket.off("error", onConnectError);
        const session = new GameSession(socket, parseInitState(message));
        // A brand-new player has zero tiles and stays that way forever
        // unless it explicitly joins -- the real client shows a "Join
        // Season?" overlay for exactly this (needsSeasonJoin on INIT; see
        // packages/client/src/client-network-init-message/client-network-
        // init-message.ts). Do it automatically here since there's no UI to
        // prompt.
        if (Boolean(message.needsSeasonJoin)) {
          session
            .joinSeasonAndWaitForSpawn()
            .then(() => resolve(session))
            .catch(reject);
        } else {
          resolve(session);
        }
      };
      socket.on("message", onFirstMessage);
      socket.on("error", onConnectError);
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
      if (typeof message.manpowerCap === "number") this.player.manpowerCap = message.manpowerCap;
      if (typeof message.manpowerRegenPerMinute === "number") this.player.manpowerRegenPerMinute = message.manpowerRegenPerMinute;
      if (typeof message.name === "string") this.player.name = message.name;
      if ("autoSettlementQueue" in message) this.autoSettlementQueue = asAutoSettlementQueue(message.autoSettlementQueue);
      if ("resourceSlots" in message) this.resourceSlots = asResourceSlots(message.resourceSlots);
      // The live stockpile (SHARD is what domain costs read) -- the real
      // client refreshes it here too, not only on TECH_UPDATE/DOMAIN_UPDATE.
      if ("strategicResources" in message) this.domains = mergeDomainState(this.domains, { strategicResources: message.strategicResources });
      if (Array.isArray(message.eventLog)) {
        this.eventLog = message.eventLog.map(asEventLogEntry).filter((entry): entry is EventLogEntry => entry !== undefined);
      }
    }
    // Fires after a CHOOSE_TECH round-trip (or other progression changes) --
    // see packages/client/src/client-network/client-network.ts's TECH_UPDATE
    // handler, which is the only place the real client refreshes techIds
    // (never via PLAYER_UPDATE). Always the full owned-tech list, not a diff.
    if (message.type === "TECH_UPDATE" && Array.isArray(message.techIds)) {
      this.techIds = asTechIds(message.techIds);
    }

    // DOMAIN_UPDATE follows a CHOOSE_DOMAIN round-trip and carries the new
    // domainIds/open choices/catalog; TECH_UPDATE resends the same fields (a
    // new tech can open a domain). Gold is deliberately NOT read from these:
    // they can be replayed after a reconnect with the gold of the moment they
    // were first computed, and only PLAYER_UPDATE is a live source for it.
    if (message.type === "TECH_UPDATE" || message.type === "DOMAIN_UPDATE") {
      this.domains = mergeDomainState(this.domains, message);
    }

    const commandId = typeof message.commandId === "string" ? message.commandId : undefined;
    const pending = commandId ? this.pending.get(commandId) : undefined;
    if (!commandId || !pending) {
      this.recordUnmatchedError(message, commandId);
      return;
    }

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

  // JOIN_SEASON_ACK/its ERROR rejections carry no commandId (they're not a
  // frontier command), so they can't go through handleMessage's commandId-
  // keyed pending map -- this uses its own one-off listener instead.
  private joinSeasonAndWaitForSpawn(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
        this.socket.off("message", onMessage);
        this.socket.off("close", onDisconnect);
        this.socket.off("error", onDisconnect);
      };
      const fail = (error: Error) => {
        cleanup();
        // GameSession's own permanent listeners (constructor) already saw
        // this socket close/error and set connectionError -- an extra
        // close() call here is a harmless no-op on an already-closing
        // socket, and a required one on the timeout path below where the
        // socket is otherwise still open and would leak (see the sibling
        // INIT-timeout handling in connect(), which does the same).
        this.socket.close();
        reject(error);
      };

      const timeoutId = setTimeout(() => fail(new Error("Timed out waiting for JOIN_SEASON_ACK")), JOIN_SEASON_TIMEOUT_MS);
      const onDisconnect = (error?: Error) => fail(error ?? new Error("Connection lost while joining the season"));

      const onMessage = (data: WebSocket.RawData) => {
        const message: unknown = JSON.parse(data.toString());
        if (!isRecord(message)) return;
        if (message.type === "JOIN_SEASON_ACK") {
          cleanup();
          resolve();
          return;
        }
        if (message.type === "ERROR" && typeof message.code === "string" && message.code.includes("SEASON")) {
          // SEASON_PENDING means the season hasn't started yet (the real
          // client shows a countdown/waiting-room screen for this) --
          // distinct from SEASON_FULL/JOIN_SEASON_FAILED, which are hard
          // failures. Neither is actionable for a bounded bot session
          // (no lobby-wait loop here), but the message should say which.
          const reason = message.code === "SEASON_PENDING" ? "the season hasn't started yet" : `rejected (${message.code})`;
          fail(new Error(`Could not join season: ${reason}`));
        }
      };
      this.socket.on("message", onMessage);
      this.socket.on("close", onDisconnect);
      this.socket.on("error", onDisconnect);
      this.socket.send(JSON.stringify({ type: "JOIN_SEASON" }));
    }).then(() => sleep(SPAWN_SETTLE_MS));
  }

  sendAction(action: BotAction): Promise<CommandResult> {
    if (this.connectionError) return Promise.reject(this.connectionError);

    const commandId = `${OWN_COMMAND_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  // See FireAndForgetAction's doc comment: no ack can be correlated to these
  // commands, so this only reports "sent" -- the caller records an intent and
  // learns the real outcome from state / drainUnmatchedErrors.
  async sendFireAndForget(action: FireAndForgetAction): Promise<void> {
    if (this.connectionError) throw this.connectionError;
    const validated = ClientMessageSchema.parse(action);
    this.socket.send(JSON.stringify(validated));
  }

  close(): void {
    this.socket.close();
  }
}
