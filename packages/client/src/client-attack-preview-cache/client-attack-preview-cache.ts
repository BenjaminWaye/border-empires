import { estimatedAttackManpowerLoss } from "@border-empires/shared";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileCombatBreakdown } from "../client-types.js";

// The attack-preview (win-chance) request/cache/read family, extracted out
// of client-queue-logic.ts (which re-exports everything below) so that file
// doesn't keep growing past the repo's 500-line-file-growth limit. Kept
// together here since these all share the same cache/pending bookkeeping on
// ClientState -- request functions on top, read/status functions below.

const ATTACK_PREVIEW_CACHE_TTL_MS = 5_000;
const ATTACK_PREVIEW_PENDING_TIMEOUT_MS = 4_000;

type AttackPreview = NonNullable<ClientState["attackPreview"]>;

const attackPreviewKey = (fromKey: string, toKey: string): string => `${fromKey}->${toKey}`;

const nextAttackPreviewRequestId = (state: ClientState): string => {
  state.attackPreviewRequestSeq += 1;
  return `attack-preview-${state.attackPreviewRequestSeq}`;
};

export const resetAttackPreviewState = (state: ClientState): void => {
  state.attackPreview = undefined;
  state.attackPreviewPendingKey = "";
  state.attackPreviewPendingRequestId = "";
  state.attackPreviewPendingStartedAt = 0;
  state.attackPreviewLatestRequestIdByKey.clear();
};

const freshCachedAttackPreview = (state: ClientState, previewKey: string): AttackPreview | undefined => {
  const preview = state.attackPreviewCacheByKey.get(previewKey);
  if (!preview) return undefined;
  if (Date.now() - preview.receivedAt > ATTACK_PREVIEW_CACHE_TTL_MS) {
    state.attackPreviewCacheByKey.delete(previewKey);
    return undefined;
  }
  return preview;
};

const requestAttackPreview = (
  state: ClientState,
  args: {
    fromKey: string;
    toKey: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  },
  deps: { ws: RealtimeSocket; onPreviewTimeout?: () => void },
  options: { useCache?: boolean; throttle?: boolean } = {}
): void => {
  const useCache = options.useCache ?? true;
  const throttle = options.throttle ?? true;
  const previewKey = attackPreviewKey(args.fromKey, args.toKey);
  if (useCache) {
    const cached = freshCachedAttackPreview(state, previewKey);
    if (cached) {
      state.attackPreview = cached;
      state.attackPreviewPendingKey = "";
      state.attackPreviewPendingRequestId = "";
      state.attackPreviewPendingStartedAt = 0;
      state.attackPreviewLatestRequestIdByKey.delete(previewKey);
      return;
    }
  }
  if (useCache && state.attackPreviewPendingKey === previewKey) return;
  const nowMs = Date.now();
  if (throttle && nowMs - state.lastAttackPreviewAt < 120) return;
  state.lastAttackPreviewAt = nowMs;
  state.attackPreviewPendingKey = previewKey;
  state.attackPreviewPendingStartedAt = nowMs;
  const requestId = nextAttackPreviewRequestId(state);
  state.attackPreviewPendingRequestId = requestId;
  state.attackPreviewLatestRequestIdByKey.set(previewKey, requestId);
  if (!useCache) {
    state.attackPreviewCacheByKey.delete(previewKey);
    if (state.attackPreview?.fromKey === args.fromKey && state.attackPreview.toKey === args.toKey) state.attackPreview = undefined;
  }
  deps.ws.send(JSON.stringify({ type: "ATTACK_PREVIEW", fromX: args.fromX, fromY: args.fromY, toX: args.toX, toY: args.toY, requestId }));
  globalThis.setTimeout(() => {
    if (state.attackPreviewPendingKey !== previewKey) return;
    if (state.attackPreviewPendingRequestId !== requestId) return;
    if (Date.now() - state.attackPreviewPendingStartedAt < ATTACK_PREVIEW_PENDING_TIMEOUT_MS) return;
    state.attackPreview = {
      fromKey: args.fromKey,
      toKey: args.toKey,
      valid: false,
      reason: "preview unavailable",
      receivedAt: Date.now()
    };
    state.attackPreviewPendingKey = "";
    state.attackPreviewPendingStartedAt = 0;
    deps.onPreviewTimeout?.();
  }, ATTACK_PREVIEW_PENDING_TIMEOUT_MS);
};

const resolvedAttackPreviewForTarget = (
  state: ClientState,
  args: {
    fromKey?: string;
    toKey: string;
    dockFallback: boolean;
  }
): AttackPreview | undefined => {
  const currentPreview = state.attackPreview;
  if (args.fromKey) {
    const previewKey = attackPreviewKey(args.fromKey, args.toKey);
    if (state.attackPreviewPendingKey === previewKey) return undefined;
    const currentMatches = currentPreview && currentPreview.toKey === args.toKey && currentPreview.fromKey === args.fromKey;
    if (currentMatches && Date.now() - currentPreview.receivedAt <= ATTACK_PREVIEW_CACHE_TTL_MS) return currentPreview;
    return freshCachedAttackPreview(state, previewKey);
  }
  if (!args.dockFallback) return undefined;
  const previewKey = attackPreviewKey(args.toKey, args.toKey);
  if (state.attackPreviewPendingKey === previewKey) return undefined;
  const currentMatches = currentPreview && currentPreview.toKey === args.toKey;
  if (currentMatches && Date.now() - currentPreview.receivedAt <= ATTACK_PREVIEW_CACHE_TTL_MS) return currentPreview;
  return freshCachedAttackPreview(state, previewKey);
};

export const requestAttackPreviewForHover = (
  state: ClientState,
  deps: {
    ws: RealtimeSocket;
    authSessionReady: boolean;
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): void => {
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!deps.authSessionReady) return;
  if (state.actionInFlight || state.capture) return;
  if (!state.hover) return;
  const hoveredTile = state.tiles.get(deps.keyFor(state.hover.x, state.hover.y));
  if (!hoveredTile) return;

  if (state.selected) {
    const from = state.tiles.get(deps.keyFor(state.selected.x, state.selected.y));
    if (from && from.ownerId === state.me && hoveredTile.ownerId && hoveredTile.ownerId !== state.me && !hoveredTile.fogged) {
      requestAttackPreview(
        state,
        {
          fromKey: deps.keyFor(from.x, from.y),
          toKey: deps.keyFor(hoveredTile.x, hoveredTile.y),
          fromX: from.x,
          fromY: from.y,
          toX: hoveredTile.x,
          toY: hoveredTile.y
        },
        deps
      );
      return;
    }
  }

  if (!hoveredTile.ownerId || hoveredTile.ownerId === state.me || hoveredTile.fogged) return;
  const from = deps.pickOriginForTarget(hoveredTile.x, hoveredTile.y);
  if (!from && !hoveredTile.dockId) return;
  if (from && from.ownerId !== state.me) return;
  requestAttackPreview(
    state,
    {
      fromKey: deps.keyFor(from?.x ?? hoveredTile.x, from?.y ?? hoveredTile.y),
      toKey: deps.keyFor(hoveredTile.x, hoveredTile.y),
      fromX: from?.x ?? hoveredTile.x,
      fromY: from?.y ?? hoveredTile.y,
      toX: hoveredTile.x,
      toY: hoveredTile.y
    },
    deps
  );
};

export const requestAttackPreviewForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    ws: RealtimeSocket;
    authSessionReady: boolean;
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
    onPreviewTimeout?: () => void;
  }
): void => {
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!deps.authSessionReady) return;
  if (state.actionInFlight || state.capture) return;
  if (!to.ownerId || to.ownerId === state.me || to.fogged) return;
  const from = deps.pickOriginForTarget(to.x, to.y);
  if (!from && !to.dockId) return;
  if (from && from.ownerId !== state.me) return;
  const fromKey = deps.keyFor(from?.x ?? to.x, from?.y ?? to.y);
  const toKey = deps.keyFor(to.x, to.y);
  requestAttackPreview(
    state,
    {
      fromKey,
      toKey,
      fromX: from?.x ?? to.x,
      fromY: from?.y ?? to.y,
      toX: to.x,
      toY: to.y
    },
    deps,
    { useCache: false, throttle: false }
  );
};

export const attackPreviewDetailForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): string | undefined => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (!preview) return undefined;
  if (!preview.valid) return preview.reason ? `Attack ${preview.reason}` : undefined;
  if (typeof preview.winChance === "number") return `${Math.round(preview.winChance * 100)}% win chance`;
  return undefined;
};

export const attackPreviewManpowerCostForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): string | undefined => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (!preview || !preview.valid) return undefined;
  if (
    typeof preview.manpowerMin !== "number" ||
    typeof preview.winChance !== "number" ||
    typeof preview.atkEff !== "number" ||
    typeof preview.defEff !== "number"
  ) {
    return undefined;
  }
  const estimate = estimatedAttackManpowerLoss(preview.manpowerMin, preview.winChance, preview.atkEff, preview.defEff);
  return `est. ${Math.round(estimate)} manpower`;
};

// The full base/infrastructure/battle breakdown for the "verify the math"
// panel next to the Launch Attack button — same source data as
// attackPreviewDetailForTarget's win-chance %, just unformatted so the UI
// can render each tier.
export const attackPreviewBreakdownForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): TileCombatBreakdown | undefined => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (!preview || !preview.valid || !preview.attacker || !preview.defender || typeof preview.winChance !== "number") return undefined;
  return { winChance: preview.winChance, attacker: preview.attacker, defender: preview.defender };
};

// Used by the attack-preview keepalive ticker (client-attack-preview-
// keepalive-ticker.ts) to decide whether an open tile menu's win-chance
// display needs a silent re-request. "Stale" here means: no resolvable
// preview for this from->to pairing (either it never arrived, or it aged
// past ATTACK_PREVIEW_CACHE_TTL_MS) and nothing is already in flight for it
// -- so requesting again is safe and won't duplicate a pending request.
export const attackPreviewIsStaleForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): boolean => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  if (!from && !to.dockId) return false;
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (preview) return false;
  const previewKey = from ? attackPreviewKey(deps.keyFor(from.x, from.y), toKey) : attackPreviewKey(toKey, toKey);
  return state.attackPreviewPendingKey !== previewKey;
};

export const attackPreviewPendingForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): boolean => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (preview) return false;
  if (from) return state.attackPreviewPendingKey === attackPreviewKey(deps.keyFor(from.x, from.y), toKey);
  if (!to.dockId) return false;
  return state.attackPreviewPendingKey === attackPreviewKey(toKey, toKey);
};
