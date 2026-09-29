// Feeds the player-funnel store from what the gateway already sees:
//
//   sessions          socket authenticated -> last socket for that player closed
//                     (reconnects within SESSION_MERGE_WINDOW_MS continue the
//                     same session; open sessions are flushed every minute so a
//                     restart loses at most that much)
//   spawned           PreparePlayer / JOIN_SEASON reported spawned: true
//   first_move        first non-rejected sim response to a command the player
//                     submitted over their socket
//   ten_tiles,        ONBOARDING_MILESTONE player messages from the simulation
//   first_contact     (apps/simulation/src/onboarding-milestones/)
//   first_interaction a resolved ATTACK on another empire's tile, or a sent or
//                     accepted truce / alliance request (barbarians never count)
//   acquisition       anonymous pre-login beacons from the client
//
// Every store call is fire-and-forget on one serial chain: tracking must never
// block or fail a login, a command, or a socket close. In-memory state is
// bounded by live sockets.
import { ONBOARDING_MILESTONE_MESSAGE_TYPE } from "@border-empires/sim-protocol";

import type { SimulationClientEvent } from "../sim-client/sim-client.js";
import {
  ACQUISITION_STEPS,
  type AcquisitionStep,
  type PlayerFunnelMilestone,
  type PlayerFunnelMilestoneDetail,
  type PlayerFunnelStore
} from "../player-funnel-store/player-funnel-store.js";

export const SESSION_MERGE_WINDOW_MS = 2 * 60_000;
export const SESSION_FLUSH_INTERVAL_MS = 60_000;
export const FUNNEL_RETENTION_MS = 180 * 24 * 60 * 60_000;
export const FUNNEL_PRUNE_INTERVAL_MS = 6 * 60 * 60_000;
export const FUNNEL_MAX_SESSION_ROWS = 200_000;
export const FUNNEL_MAX_ACQUISITION_ROWS = 200_000;
export const ACQUISITION_BEACONS_PER_MINUTE = 240;

const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DETAIL_KEYS = ["method", "referrerHost", "utmSource", "utmMedium", "utmCampaign"] as const;
const DETAIL_MAX_LENGTH = 80;

export type AcquisitionBeaconResult = "recorded" | "duplicate" | "invalid" | "rate_limited";

export type PlayerFunnelCounters = {
  beaconRecorded: number;
  beaconDuplicate: number;
  beaconInvalid: number;
  beaconRateLimited: number;
  milestonesRecorded: number;
  storeErrors: number;
};

export type PlayerFunnelTrackerDeps = {
  store: PlayerFunnelStore;
  now: () => number;
  isAiPlayerId: (playerId: string) => boolean;
  onStoreError: (operation: string, error: unknown) => void;
};

export type PlayerFunnelTracker = {
  onSocketAuthenticated: (socketSessionId: string, playerId: string, bindingSource: string | undefined) => void;
  onSocketClosed: (socketSessionId: string) => void;
  onSpawned: (playerId: string) => void;
  // Returns true when the event was a gateway-only ONBOARDING_MILESTONE
  // message the caller must not relay to clients.
  observeSimulationEvent: (event: SimulationClientEvent, clientSubmitted: boolean) => boolean;
  onDiplomacyInteraction: (playerId: string, targetPlayerId: string | undefined, kind: "truce" | "alliance") => void;
  recordAcquisitionBeacon: (body: unknown) => AcquisitionBeaconResult;
  flushOpenSessions: () => Promise<void>;
  start: () => void;
  stop: () => void;
  counters: () => PlayerFunnelCounters;
  // Resolves once every queued store write has run (tests / shutdown).
  idle: () => Promise<void>;
};

type OpenSession = { rowId: Promise<number | undefined>; sockets: Set<string> };

const isBarbarianId = (playerId: string): boolean => playerId.startsWith("barbarian-");

const parseAcquisitionBeacon = (body: unknown): { visitorId: string; step: AcquisitionStep; detail: Record<string, string> } | undefined => {
  let value = body;
  if (typeof value === "string") {
    try { value = JSON.parse(value) as unknown; } catch { return undefined; }
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const { visitorId, step } = record;
  if (typeof visitorId !== "string" || !VISITOR_ID_PATTERN.test(visitorId)) return undefined;
  if (typeof step !== "string" || !(ACQUISITION_STEPS as readonly string[]).includes(step)) return undefined;
  const rawDetail = record.detail && typeof record.detail === "object" ? (record.detail as Record<string, unknown>) : {};
  const detail: Record<string, string> = {};
  for (const key of DETAIL_KEYS) {
    const detailValue = rawDetail[key];
    if (typeof detailValue === "string" && detailValue.length > 0) detail[key] = detailValue.slice(0, DETAIL_MAX_LENGTH);
  }
  return { visitorId, step: step as AcquisitionStep, detail };
};

// OnboardingMilestonePayload as parsed off the wire — every field is re-checked.
type MilestonePayload = { kind?: unknown; at?: unknown; withPlayerId?: unknown; withIsAi?: unknown };

export const createPlayerFunnelTracker = (deps: PlayerFunnelTrackerDeps): PlayerFunnelTracker => {
  const openByPlayer = new Map<string, OpenSession>();
  const playerBySocket = new Map<string, string>();
  const counters: PlayerFunnelCounters = { beaconRecorded: 0, beaconDuplicate: 0, beaconInvalid: 0, beaconRateLimited: 0, milestonesRecorded: 0, storeErrors: 0 };
  let chain: Promise<unknown> = Promise.resolve();
  let beaconWindowStartedAt = 0;
  let beaconsInWindow = 0;
  let flushTimer: ReturnType<typeof setInterval> | undefined;
  let pruneTimer: ReturnType<typeof setInterval> | undefined;

  const enqueue = <T>(operation: string, task: () => Promise<T>): Promise<T | undefined> => {
    const run = chain.then(task).catch((error: unknown) => {
      counters.storeErrors += 1;
      deps.onStoreError(operation, error);
      return undefined;
    });
    chain = run;
    return run;
  };

  const recordMilestone = (playerId: string, milestone: PlayerFunnelMilestone, at: number, detail?: PlayerFunnelMilestoneDetail): void => {
    void enqueue(`milestone:${milestone}`, async () => {
      if (await deps.store.recordMilestone(playerId, milestone, at, detail)) counters.milestonesRecorded += 1;
    });
  };

  const otherEmpire = (playerId: string, otherId: string | undefined): otherId is string =>
    Boolean(otherId) && otherId !== playerId && !isBarbarianId(otherId!);

  const observeOnboardingMilestone = (event: Extract<SimulationClientEvent, { eventType: "PLAYER_MESSAGE" }>): void => {
    const payload = event.payload as MilestonePayload;
    const at = typeof payload.at === "number" ? payload.at : deps.now();
    if (payload.kind === "TEN_TILES") recordMilestone(event.playerId, "ten_tiles", at);
    if (payload.kind === "FIRST_CONTACT" && typeof payload.withPlayerId === "string") {
      recordMilestone(event.playerId, "first_contact", at, {
        withPlayerId: payload.withPlayerId,
        withIsAi: typeof payload.withIsAi === "boolean" ? payload.withIsAi : deps.isAiPlayerId(payload.withPlayerId)
      });
    }
  };

  // Extends the session row and the player's lastSeenAt (ensurePlayer only
  // bumps last_seen_at for an existing row) so "last seen" means when they
  // were last connected, not when their last session started.
  const touchOpenSession = async (playerId: string, open: OpenSession, at: number): Promise<void> => {
    const rowId = await open.rowId;
    if (rowId === undefined) return;
    await deps.store.touchSession(rowId, at);
    await deps.store.ensurePlayer(playerId, at, false);
  };

  const flushOpenSessions = async (): Promise<void> => {
    const at = deps.now();
    for (const [playerId, open] of openByPlayer) {
      void enqueue("session:flush", () => touchOpenSession(playerId, open, at));
    }
    await chain;
  };

  return {
    onSocketAuthenticated: (socketSessionId, playerId, bindingSource) => {
      if (playerBySocket.has(socketSessionId)) return;
      playerBySocket.set(socketSessionId, playerId);
      const existing = openByPlayer.get(playerId);
      if (existing) {
        existing.sockets.add(socketSessionId);
        return;
      }
      const at = deps.now();
      const rowId = enqueue("session:open", async () => {
        await deps.store.ensurePlayer(playerId, at, bindingSource === "new");
        const last = await deps.store.lastSession(playerId);
        if (last && at - last.endedAt <= SESSION_MERGE_WINDOW_MS) {
          await deps.store.touchSession(last.id, at);
          return last.id;
        }
        return deps.store.openSession(playerId, at);
      });
      openByPlayer.set(playerId, { rowId, sockets: new Set([socketSessionId]) });
    },

    onSocketClosed: (socketSessionId) => {
      const playerId = playerBySocket.get(socketSessionId);
      if (!playerId) return;
      playerBySocket.delete(socketSessionId);
      const open = openByPlayer.get(playerId);
      if (!open) return;
      open.sockets.delete(socketSessionId);
      if (open.sockets.size > 0) return;
      openByPlayer.delete(playerId);
      const at = deps.now();
      void enqueue("session:close", () => touchOpenSession(playerId, open, at));
    },

    onSpawned: (playerId) => recordMilestone(playerId, "spawned", deps.now()),

    observeSimulationEvent: (event, clientSubmitted) => {
      if (event.eventType === "PLAYER_MESSAGE" && event.messageType === ONBOARDING_MILESTONE_MESSAGE_TYPE) {
        observeOnboardingMilestone(event);
        return true;
      }
      if (clientSubmitted && event.eventType !== "COMMAND_REJECTED" && event.eventType !== "COMBAT_CANCELLED") {
        const type = "actionType" in event && typeof event.actionType === "string" ? event.actionType : "COMMAND";
        recordMilestone(event.playerId, "first_move", deps.now(), { type });
      }
      if (event.eventType === "COMBAT_RESOLVED" && event.actionType === "ATTACK") {
        const defenderId = event.combatResult?.defenderOwnerId;
        if (otherEmpire(event.playerId, defenderId)) {
          recordMilestone(event.playerId, "first_interaction", deps.now(), { type: "attack", withPlayerId: defenderId, withIsAi: deps.isAiPlayerId(defenderId) });
        }
      }
      return false;
    },

    onDiplomacyInteraction: (playerId, targetPlayerId, kind) => {
      if (!otherEmpire(playerId, targetPlayerId)) return;
      recordMilestone(playerId, "first_interaction", deps.now(), { type: kind, withPlayerId: targetPlayerId, withIsAi: deps.isAiPlayerId(targetPlayerId) });
    },

    recordAcquisitionBeacon: (body) => {
      const at = deps.now();
      if (at - beaconWindowStartedAt >= 60_000) {
        beaconWindowStartedAt = at;
        beaconsInWindow = 0;
      }
      if (beaconsInWindow >= ACQUISITION_BEACONS_PER_MINUTE) {
        counters.beaconRateLimited += 1;
        return "rate_limited";
      }
      beaconsInWindow += 1;
      const beacon = parseAcquisitionBeacon(body);
      if (!beacon) {
        counters.beaconInvalid += 1;
        return "invalid";
      }
      void enqueue("acquisition", async () => {
        const inserted = await deps.store.recordAcquisitionStep({ ...beacon, at });
        if (inserted) counters.beaconRecorded += 1;
        else counters.beaconDuplicate += 1;
      });
      return "recorded";
    },

    flushOpenSessions,

    start: () => {
      const prune = (): void => {
        void enqueue("prune", () =>
          deps.store.prune({ olderThan: deps.now() - FUNNEL_RETENTION_MS, maxSessionRows: FUNNEL_MAX_SESSION_ROWS, maxAcquisitionRows: FUNNEL_MAX_ACQUISITION_ROWS })
        );
      };
      prune();
      flushTimer = setInterval(() => void flushOpenSessions(), SESSION_FLUSH_INTERVAL_MS);
      pruneTimer = setInterval(prune, FUNNEL_PRUNE_INTERVAL_MS);
      flushTimer.unref?.();
      pruneTimer.unref?.();
    },

    stop: () => {
      if (flushTimer) clearInterval(flushTimer);
      if (pruneTimer) clearInterval(pruneTimer);
    },

    counters: () => ({ ...counters }),

    idle: async () => {
      await chain;
    }
  };
};
