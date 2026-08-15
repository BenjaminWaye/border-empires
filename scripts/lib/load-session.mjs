// WebSocket client-session lifecycle for the concurrent load harness:
// connect + INIT, incremental world-view upkeep from TILE_DELTA_BATCH,
// latency correlation, and serial per-client action dispatch.
//
// Extracted from rewrite-concurrent-load.mjs (500-line source budget, see
// AGENTS.md).
import WebSocket from "ws";
import { normalizeTile, originKeyOf, pickCandidatePayload, targetKeyOf, tileKey } from "./load-candidates.mjs";

export const openSession = (wsUrl, token, timeoutMs = 15_000) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const state = {
      socket,
      playerId: token,
      nextClientSeq: 1,
      tilesByKey: new Map(),
      pending: new Map(),
      // Tracks accepted-but-not-yet-resolved commands so COMBAT_RESULT/FRONTIER_RESULT
      // latency can be sampled passively, without making the action loop wait for it.
      // EXPAND resolves via FRONTIER_CLAIM_MS (15s) and ATTACK via COMBAT_LOCK_MS (30s)
      // — both game-mechanic timers, not server latency — so blocking the pacing loop
      // on them (as opposed to just observing them) reintroduces the exact bug fixed in
      // the nightly-load-harness workflow (see LOAD_HARNESS_WAIT_FOR_RESULT).
      awaitingResolution: new Map(),
      resolvedLatencies: [],
      // Single-slot, not a map — this script dispatches serially (one
      // command in flight per client), so there's never more than one
      // uncorrelated command awaiting its ACTION_ACCEPTED at a time. See the
      // SET_MUSTER comment in the message handler below.
      waitingUncorrelated: undefined,
      ready: false
    };
    const timer = setTimeout(() => { try { socket.close(); } catch { /* */ } reject(new Error(`INIT timeout for ${token}`)); }, timeoutMs);

    socket.on("open", () => socket.send(JSON.stringify({ type: "AUTH", token })));

    socket.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "INIT") {
        for (const tile of (Array.isArray(msg.initialState?.tiles) ? msg.initialState.tiles : [])) {
          const n = normalizeTile(tile);
          state.tilesByKey.set(tileKey(n.x, n.y), n);
        }
        state.playerId = typeof msg.player?.id === "string" ? msg.player.id : state.playerId;
        state.nextClientSeq = Math.max(1, Number(msg.recovery?.nextClientSeq ?? 1));
        state.ready = true;
        clearTimeout(timer);
        resolve(state);
        return;
      }

      if (msg.type === "TILE_DELTA_BATCH" && Array.isArray(msg.tiles)) {
        for (const tile of msg.tiles) {
          const n = normalizeTile(tile);
          const existing = state.tilesByKey.get(tileKey(n.x, n.y)) ?? { x: n.x, y: n.y };
          state.tilesByKey.set(tileKey(n.x, n.y), { ...existing, ...n });
        }
      }

      // Checked independently of `pending` below — by the time a resolution
      // message arrives, ACTION_ACCEPTED has usually already deleted the
      // pending entry and unblocked the action loop for this commandId.
      if (msg.type === "COMBAT_RESULT" || msg.type === "FRONTIER_RESULT") {
        const awaiting = state.awaitingResolution.get(msg.commandId);
        if (awaiting) {
          state.awaitingResolution.delete(msg.commandId);
          state.resolvedLatencies.push(Date.now() - awaiting.startedAt);
        }
      }

      // SET_MUSTER needs special handling on two fronts:
      // 1. dispatchDurableCommand is called without withMetadata (see
      //    gateway-app.ts) — unlike EXPAND/ATTACK/SETTLE, the client's
      //    commandId is never forwarded; the server always assigns its own.
      //    commandId correlation is therefore impossible.
      // 2. handleSetMusterCommand (apps/simulation/src/runtime-structure-
      //    lifecycle-command-handlers.ts) calls resolveCommand() directly on
      //    success — it never goes through an "accepted" step at all, so no
      //    ACTION_ACCEPTED is ever sent for it, correlatable or not.
      // The only response the client genuinely gets is COMMAND_QUEUED (the
      // gateway's own persistence ack, sent before the simulation RPC even
      // happens) — that's the best available signal, though it necessarily
      // measures less of the round trip than ACTION_ACCEPTED does for the
      // other three action types. Since this script dispatches serially
      // (never more than one command in flight per client), an uncorrelated
      // COMMAND_QUEUED arriving while a SET_MUSTER is the only thing awaited
      // can safely be attributed to it.
      if (msg.type === "COMMAND_QUEUED" && state.waitingUncorrelated && !state.pending.has(msg.commandId)) {
        const entry = state.waitingUncorrelated;
        state.waitingUncorrelated = undefined;
        clearTimeout(entry.timer);
        entry.resolve({ kind: "accepted", actionType: entry.payload.type, acceptedDelayMs: Date.now() - entry.startedAt });
        return;
      }

      const entry = state.pending.get(msg.commandId);
      if (!entry) return;

      if (msg.type === "ACTION_ACCEPTED") {
        entry.acceptedAt = Date.now();
        clearTimeout(entry.timer);
        state.pending.delete(msg.commandId);
        // Only EXPAND/ATTACK get a correlated terminal message (FRONTIER_RESULT/
        // COMBAT_RESULT) — SETTLE and SET_MUSTER don't, so there's nothing to await.
        if (entry.payload.type === "EXPAND" || entry.payload.type === "ATTACK") {
          state.awaitingResolution.set(msg.commandId, { startedAt: entry.startedAt });
        }
        entry.resolve({ kind: "accepted", actionType: entry.payload.type, acceptedDelayMs: entry.acceptedAt - entry.startedAt });
        return;
      }

      if (msg.type === "COMBAT_RESULT" || msg.type === "FRONTIER_RESULT") {
        if (entry.acceptedAt === 0) entry.acceptedAt = Date.now();
        clearTimeout(entry.timer);
        state.pending.delete(msg.commandId);
        entry.resolve({ kind: "accepted", actionType: entry.payload.type, acceptedDelayMs: entry.acceptedAt - entry.startedAt });
        return;
      }

      if (msg.type === "ERROR") {
        const recoverable = ["ATTACK_COOLDOWN", "ATTACK_TARGET_INVALID", "NOT_OWNER", "NOT_ADJACENT",
          "LOCKED", "EXPAND_TARGET_OWNED", "BARRIER", "EXPAND_COOLDOWN",
          // SETTLE_INVALID covers several reasons (not a frontier tile, bad terrain,
          // already settling, no free development slot) and MUSTER_INVALID covers
          // "no muster on owned tile" / "owned LAND tile required" — all are
          // per-tile, so learning and skipping the tile (not retrying it every
          // tick until its 60s SETTLE_MS timer clears) is the right response.
          "SETTLE_INVALID", "MUSTER_INVALID",
          // Safety net for MUSTER_ADVANCE_READY_AMOUNT being an approximation
          // of the server's real (target-dependent) threshold — if a candidate
          // still isn't ready, learn and skip it rather than retry every tick.
          "INSUFFICIENT_MUSTER"];
        if (recoverable.includes(msg.code)) {
          clearTimeout(entry.timer);
          state.pending.delete(msg.commandId);
          entry.resolve({
            kind: "error_recoverable",
            code: msg.code,
            originKey: originKeyOf(entry.payload),
            targetKey: targetKeyOf(entry.payload)
          });
          return;
        }

        if (msg.code === "INSUFFICIENT_MANPOWER" || msg.code === "INSUFFICIENT_RESOURCES") {
          clearTimeout(entry.timer);
          state.pending.delete(msg.commandId);
          entry.resolve({ kind: "resource_exhausted", code: msg.code });
          return;
        }

        clearTimeout(entry.timer);
        state.pending.delete(msg.commandId);
        entry.reject(new Error(`${msg.code}: ${msg.message}`));
      }
    });

    socket.on("error", (err) => { clearTimeout(timer); reject(err); });
  });

export const closeSession = async (state) => {
  if (!state?.socket) return;
  try { state.socket.close(); } catch { /* */ }
};

// ── Serial action dispatch (one per client, no listener pileup) ─────────────

export const sendAction = (state, timeoutMs, invalidTargets, invalidOrigins) =>
  new Promise((resolve, reject) => {
    const candidate = pickCandidatePayload(state.tilesByKey, state.playerId, invalidTargets, invalidOrigins);
    if (!candidate) {
      reject(new Error("no frontier action candidate"));
      return;
    }
    const payload = {
      ...candidate,
      clientSeq: state.nextClientSeq,
      commandId: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
    state.nextClientSeq += 1;
    const startedAt = Date.now();

    const entry = {
      resolve,
      reject,
      startedAt,
      acceptedAt: 0,
      payload,
      timer: setTimeout(() => {
        state.pending.delete(payload.commandId);
        if (state.waitingUncorrelated === entry) state.waitingUncorrelated = undefined;
        reject(new Error("action timeout"));
      }, timeoutMs)
    };

    state.pending.set(payload.commandId, entry);
    // See the SET_MUSTER comment in the message handler — its commandId is
    // never echoed back, so it can't be found via state.pending at all.
    if (payload.type === "SET_MUSTER") state.waitingUncorrelated = entry;
    state.socket.send(JSON.stringify(payload));
  });
