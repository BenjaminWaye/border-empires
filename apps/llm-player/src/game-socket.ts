// Thin WebSocket client for the existing gateway protocol — connects exactly
// like the real browser client does (AUTH -> INIT), just without a UI. Based
// on the connection pattern in scripts/rewrite-local-soak.mjs, the repo's
// existing non-browser WS bot.
//
// The INIT message itself has no shared exported type (it's assembled ad hoc
// by apps/realtime-gateway/src/init-payload/init-payload.ts for display
// purposes), so it's read defensively here rather than cast to a strict type.
import WebSocket from "ws";
import { ClientMessageSchema, type ClientMessage, type EconomicStructureType, type SlotResource } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { sleep } from "./sleep.js";

// §5 (docs/manpower-economy-rewrite-plan.md): FOOD/TITANIUM/CRYSTAL/UMBRITE
// build costs are retired as a stockpile spend (strategicResources) -- a
// structure needing one of these permanently occupies a SLOT instead
// (packages/shared/src/structure-slots/structure-slots.ts), gated by a
// global per-resource supply/demand pool. This is the same precomputed pair
// the server's own hasFreeResourceSlots gates BUILD_STRUCTURE on
// (packages/sim-protocol/src/index.ts's doc comment on `resourceSlots`).
// strategicResources itself isn't tracked here -- SHARD is the only key it
// still governs (monument assembly), and monuments are out of scope for
// this bot (see structures.ts's doc comment).
export type ResourceSlots = { supply: Record<SlotResource, number>; demand: Record<SlotResource, number> };

// Shared by every eligibility check that needs a real free-slot count
// (structures.ts's hasFreeSlots, viewport.ts's buildBeaconSites) so the
// supply-minus-demand formula can't quietly drift between them.
export const freeResourceSlotCount = (resourceSlots: ResourceSlots, resource: SlotResource): number =>
  resourceSlots.supply[resource] - resourceSlots.demand[resource];

const EMPTY_RESOURCE_SLOTS: ResourceSlots = {
  supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
  demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
};

export type GameTile = PlayerSubscriptionSnapshot["tiles"][number];
export type EventLogEntry = NonNullable<PlayerSubscriptionSnapshot["player"]>["eventLog"] extends
  | Array<infer Entry>
  | undefined
  ? Entry
  : never;

export type GameInitState = {
  playerId: string;
  playerName: string;
  gold: number;
  manpower: number;
  manpowerCap: number;
  // Base is MANPOWER_BASE_REGEN_PER_MINUTE (packages/shared/src/config.ts) --
  // ~0.2/min, i.e. ~12h to refill an empty pool from scratch. Town
  // population growth raises this (and the cap), so read the live value
  // here rather than assuming the base rate.
  manpowerRegenPerMinute: number;
  tiles: GameTile[];
  // §20 durable "what happened while I was away" feed (see
  // packages/sim-protocol/src/index.ts) -- most-recent-last, deduplicated by
  // id since it's unclear from the wire alone whether a later PLAYER_UPDATE
  // resends the full log or only new entries; merging by id is correct
  // either way.
  // Always the server's latest full log for this player (already capped
  // server-side), not something to accumulate across updates -- see
  // packages/client/src/client-network/client-network.ts's identical
  // `state.eventLog = incomingEventLog` full-replace handling.
  eventLog: EventLogEntry[];
  // Server-computed candidates (town/dock/resource/town-ring FRONTIER tiles
  // in reach) for the "Auto-settle" mechanic -- the real browser client
  // drains this itself by firing ordinary SETTLE commands
  // (packages/client/src/client-development-queue/client-development-queue.ts's
  // applyAutoSettlementQueueFromServer), budget-gated by manpower; a human
  // player never manually settles these. Always the server's latest full
  // queue (see client-network.ts's identical handling), not something to
  // accumulate across updates.
  autoSettlementQueue: Array<{ x: number; y: number }>;
  // Researched tech ids. Only refreshed via a TECH_UPDATE event (fires after
  // a CHOOSE_TECH round-trip, or other progression changes) -- unlike
  // eventLog/autoSettlementQueue this is NOT part of PLAYER_UPDATE (see
  // packages/client/src/client-network/client-network.ts's separate
  // TECH_UPDATE handler), so a session that never sees one keeps whatever
  // INIT reported.
  techIds: string[];
  // The real gate for FOOD/TITANIUM/CRYSTAL/UMBRITE structure eligibility --
  // see ResourceSlots's doc comment. Refreshed via PLAYER_UPDATE.
  resourceSlots: ResourceSlots;
};

export type BotAction =
  | { type: "EXPAND"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "ATTACK"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "SETTLE"; x: number; y: number };

// Separate from BotAction: BUILD_ECONOMIC_STRUCTURE carries no commandId in
// its own schema (packages/shared/src/messages/messages.ts), and the gateway
// only forwards commandId/clientSeq for commands it dispatches with
// withMetadata=true (SETTLE, RUSH_BUY, ...) -- BUILD_ECONOMIC_STRUCTURE isn't
// one of them (apps/realtime-gateway/src/gateway-app/gateway-app.ts, same for
// CHOOSE_TECH below). There is no ACTION_ACCEPTED/ERROR to correlate back to
// either call, so unlike sendAction() neither can report accepted/rejected --
// both are fire-and-forget, same as a real player waiting out a build timer
// or a tech's "completed" TECH_UPDATE with no synchronous confirmation
// dialog either. structureType is typed broadly (any EconomicStructureType)
// at this wire layer; which types the bot actually offers the LLM is a
// curated allowlist decided in structures.ts, not here.
export type BuildEconomicStructureAction = { type: "BUILD_ECONOMIC_STRUCTURE"; x: number; y: number; structureType: EconomicStructureType };
export type ChooseTechAction = { type: "CHOOSE_TECH"; techId: string };
export type FireAndForgetAction = BuildEconomicStructureAction | ChooseTechAction;

export type CommandResult = { outcome: "accepted" } | { outcome: "error"; code: string; message: string };

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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export const tileKey = (x: number, y: number): string => `${x},${y}`;

const asAutoSettlementQueue = (value: unknown): Array<{ x: number; y: number }> => {
  if (!Array.isArray(value)) return [];
  const entries: Array<{ x: number; y: number }> = [];
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.x === "number" && typeof entry.y === "number") entries.push({ x: entry.x, y: entry.y });
  }
  return entries;
};

const asTechIds = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);

const asSlotRecord = (value: unknown): Record<SlotResource, number> => {
  if (!isRecord(value)) return { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const at = (key: SlotResource): number => (typeof value[key] === "number" ? (value[key] as number) : 0);
  return { FOOD: at("FOOD"), TITANIUM: at("TITANIUM"), CRYSTAL: at("CRYSTAL"), UMBRITE: at("UMBRITE") };
};

const asResourceSlots = (value: unknown): ResourceSlots => {
  if (!isRecord(value)) return EMPTY_RESOURCE_SLOTS;
  return { supply: asSlotRecord(value.supply), demand: asSlotRecord(value.demand) };
};

const asEventLogEntry = (value: unknown): EventLogEntry | undefined => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    typeof value.text !== "string" ||
    typeof value.occurredAt !== "number"
  ) {
    return undefined;
  }
  const x = typeof value.x === "number" ? value.x : undefined;
  const y = typeof value.y === "number" ? value.y : undefined;
  return { id: value.id, type: value.type, text: value.text, occurredAt: value.occurredAt, ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}) };
};

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
    resourceSlots: asResourceSlots(rawPlayer.resourceSlots)
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
      manpowerCap: this.player.manpowerCap,
      manpowerRegenPerMinute: this.player.manpowerRegenPerMinute,
      tiles: [...this.tiles.values()],
      eventLog: this.eventLog,
      autoSettlementQueue: this.autoSettlementQueue,
      techIds: this.techIds,
      resourceSlots: this.resourceSlots
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

  // See FireAndForgetAction's doc comment: no ack exists for either of these
  // commands, so this can only report "sent", not "accepted"/"rejected".
  async sendFireAndForget(action: FireAndForgetAction): Promise<void> {
    if (this.connectionError) throw this.connectionError;
    const validated = ClientMessageSchema.parse(action);
    this.socket.send(JSON.stringify(validated));
  }

  close(): void {
    this.socket.close();
  }
}
