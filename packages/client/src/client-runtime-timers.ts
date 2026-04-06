import type { ClientState } from "./client-state.js";
import type { StartClientRuntimeLoopDeps } from "./client-runtime-types.js";

export const startClientRuntimeTimers = (state: ClientState, deps: StartClientRuntimeLoopDeps): void => {
  setInterval(deps.renderCaptureProgress, 100);
  setInterval(deps.renderShardAlert, 250);
  setInterval(() => {
    if (state.collectVisibleCooldownUntil > Date.now()) deps.renderHud();
    const expiredSettlementProgress = deps.cleanupExpiredSettlementProgress();
    const startedQueuedDevelopment = state.developmentQueue.length > 0 ? deps.processDevelopmentQueue() : false;
    if (expiredSettlementProgress || state.settleProgressByTile.size > 0 || startedQueuedDevelopment) deps.renderHud();
    if (!state.actionInFlight) return;
    const started = state.actionStartedAt;
    if (!started) return;
    if (!state.combatStartAck && Date.now() - started > 4_500) {
      const current = state.actionCurrent;
      const currentKey = current ? deps.keyFor(current.x, current.y) : "";
      const keepOptimisticExpand = deps.shouldPreserveOptimisticExpandByKey(currentKey);
      state.capture = undefined;
      if (state.pendingCombatReveal?.targetKey === currentKey) state.pendingCombatReveal = undefined;
      state.actionInFlight = false;
      state.combatStartAck = false;
      state.actionStartedAt = 0;
      state.actionTargetKey = "";
      state.actionCurrent = undefined;
      if (currentKey && !keepOptimisticExpand) deps.clearOptimisticTileState(currentKey, true);
      if (keepOptimisticExpand) {
        state.frontierSyncWaitUntilByTarget.set(currentKey, Date.now() + 12_000);
        state.actionQueue = state.actionQueue.filter((entry) => deps.keyFor(entry.x, entry.y) !== currentKey);
        state.queuedTargetKeys.delete(currentKey);
        if (currentKey) deps.dropQueuedTargetKeyIfAbsent(currentKey);
        deps.pushFeed("No combat start from server yet; waiting for frontier sync instead of retrying the same tile.", "combat", "warn");
        deps.requestViewRefresh(1, true);
      } else if (current && (current.retries ?? 0) < 3) {
        const retryAction: { x: number; y: number; mode?: "normal" | "breakthrough"; retries: number } = { x: current.x, y: current.y, retries: (current.retries ?? 0) + 1 };
        if (current.mode) retryAction.mode = current.mode;
        state.actionQueue.unshift(retryAction);
        state.queuedTargetKeys.add(deps.keyFor(current.x, current.y));
        deps.pushFeed(`No combat start from server; retrying action (${retryAction.retries}/3).`, "combat", "warn");
      } else {
        deps.pushFeed("No combat start from server; skipping queued action.", "combat", "warn");
        if (currentKey) deps.dropQueuedTargetKeyIfAbsent(currentKey);
      }
      deps.processActionQueue();
      deps.renderHud();
      return;
    }
    if (!state.capture) return;
    if (Date.now() > state.capture.resolvesAt + 5_000) {
      const timedOutCurrentKey = state.actionCurrent ? deps.keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
      const keepOptimisticExpand = deps.shouldPreserveOptimisticExpandByKey(timedOutCurrentKey);
      state.capture = undefined;
      if (state.pendingCombatReveal?.targetKey === timedOutCurrentKey) state.pendingCombatReveal = undefined;
      state.actionInFlight = false;
      state.combatStartAck = false;
      state.actionStartedAt = 0;
      state.actionTargetKey = "";
      state.actionCurrent = undefined;
      if (timedOutCurrentKey) deps.dropQueuedTargetKeyIfAbsent(timedOutCurrentKey);
      if (timedOutCurrentKey && !keepOptimisticExpand) deps.clearOptimisticTileState(timedOutCurrentKey, true);
      deps.pushFeed(keepOptimisticExpand ? "Frontier result delayed; keeping optimistic tile while continuing queue." : "Combat result delayed locally; continuing queue.", "combat", "warn");
      if (keepOptimisticExpand) {
        state.frontierSyncWaitUntilByTarget.set(timedOutCurrentKey, Date.now() + 12_000);
        state.actionQueue = state.actionQueue.filter((entry) => deps.keyFor(entry.x, entry.y) !== timedOutCurrentKey);
        state.queuedTargetKeys.delete(timedOutCurrentKey);
        deps.requestViewRefresh(1, true);
      }
      deps.reconcileActionQueue();
      deps.processActionQueue();
      deps.renderHud();
    }
  }, 300);
  setInterval(() => {
    if (state.connection !== "initialized") return;
    if (state.actionInFlight || state.capture || state.actionQueue.length > 0) return;
    if (state.firstChunkAt === 0 && Date.now() - state.lastSubAt > 20_000) deps.requestViewRefresh(2, true);
  }, deps.isMobile() ? 8_000 : 5_000);
  setInterval(() => {
    const loadingActive = state.connection !== "initialized" || state.firstChunkAt === 0;
    if (!loadingActive) return;
    deps.renderHud();
    if (state.connection === "initialized" && state.firstChunkAt === 0 && Date.now() - state.lastSubAt > 4_000) deps.requestViewRefresh(1, true);
  }, 300);
};
