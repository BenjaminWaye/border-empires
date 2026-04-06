import { activeTruceWithPlayerFromState, breakAllianceFromUi, breakTruceFromUi, chooseTechFromUi, explainActionFailureFromServer, sendAllianceRequestFromUi, sendTruceRequestFromUi } from "./client-player-actions.js";
import {
  buildFortOnSelected as buildFortOnSelectedFromModule,
  buildSiegeOutpostOnSelected as buildSiegeOutpostOnSelectedFromModule,
  cancelOngoingCapture as cancelOngoingCaptureFromModule,
  collectSelectedShard as collectSelectedShardFromModule,
  collectSelectedYield as collectSelectedYieldFromModule,
  collectVisibleYield as collectVisibleYieldFromModule,
  hideHoldBuildMenu as hideHoldBuildMenuFromModule,
  hideTileActionMenu as hideTileActionMenuFromModule,
  settleSelected as settleSelectedFromModule,
  uncaptureSelected as uncaptureSelectedFromModule
} from "./client-selected-actions.js";
import { createClientActionFlowDispatch } from "./client-action-flow-dispatch.js";
import { createClientActionFlowMenu } from "./client-action-flow-menu.js";
import { createClientActionFlowQueue } from "./client-action-flow-queue.js";
import { createClientActionFlowTargeting } from "./client-action-flow-targeting.js";
import type { ClientState } from "./client-state.js";
import type { ActiveTruceView, Tile } from "./client-types.js";

type ActionFlowDeps = Record<string, any> & {
  state: ClientState;
  ws: WebSocket;
  wsUrl: string;
  canvas: HTMLCanvasElement;
  techPickEl: HTMLSelectElement;
  mobileTechPickEl: HTMLSelectElement;
  tileActionMenuEl: HTMLDivElement;
  holdBuildMenuEl: HTMLDivElement;
};

export const createClientActionFlow = (deps: ActionFlowDeps) => {
  const {
    state,
    ws,
    wsUrl,
    techPickEl,
    mobileTechPickEl,
    tileActionMenuEl,
    holdBuildMenuEl,
    setAuthStatus,
    syncAuthOverlay,
    pushFeed,
    renderHud
  } = deps;

  const requireAuthedSession = (message = "Finish sign-in before interacting with the map."): boolean => {
    if (state.authReady && state.authSessionReady) return true;
    if (!state.authReady && ws.readyState === ws.OPEN && state.authSessionReady) return true;
    if (!state.authReady) {
      setAuthStatus(message, "error");
      syncAuthOverlay();
      return false;
    }
    if (state.authSessionReady) return true;
    setAuthStatus(message, "error");
    syncAuthOverlay();
    return false;
  };

  const sendGameMessage = (payload: unknown, message?: string): boolean => {
    if (!requireAuthedSession(message)) return false;
    ws.send(JSON.stringify(payload));
    return true;
  };

  const requestTileDetailIfNeeded = (tile: Tile | undefined): void => {
    if (!tile || tile.fogged || tile.detailLevel === "full") return;
    if (ws.readyState !== ws.OPEN || !state.authSessionReady) return;
    const tileKey = deps.keyFor(tile.x, tile.y);
    const lastRequestedAt = state.tileDetailRequestedAt.get(tileKey) ?? 0;
    if (Date.now() - lastRequestedAt < 1500) return;
    ws.send(JSON.stringify({ type: "REQUEST_TILE_DETAIL", x: tile.x, y: tile.y }));
    state.tileDetailRequestedAt.set(tileKey, Date.now());
  };

  const playerActionDeps = () => ({
    state,
    techPickEl,
    mobileTechPickEl,
    ws,
    wsUrl,
    setAuthStatus,
    syncAuthOverlay,
    pushFeed,
    renderHud,
    sendGameMessage
  });

  const sendAllianceRequest = (target: string): void => sendAllianceRequestFromUi(target, playerActionDeps());
  const sendTruceRequest = (targetPlayerName: string, durationHours: 12 | 24): void => sendTruceRequestFromUi(targetPlayerName, durationHours, playerActionDeps());
  const breakAlliance = (target: string): void => breakAllianceFromUi(target, playerActionDeps());
  const breakTruce = (targetPlayerId: string): void => breakTruceFromUi(targetPlayerId, playerActionDeps());
  const activeTruceWithPlayer = (playerId?: string | null): ActiveTruceView | undefined => activeTruceWithPlayerFromState(state, playerId);
  const chooseTech = (techIdRaw?: string): void => chooseTechFromUi(techIdRaw, playerActionDeps());
  const explainActionFailure = (code: string, message: string): string => explainActionFailureFromServer(code, message);

  const hideHoldBuildMenu = (): void => {
    if (typeof deps.hideHoldBuildMenu === "function") return deps.hideHoldBuildMenu();
    hideHoldBuildMenuFromModule(holdBuildMenuEl);
  };

  const hideTileActionMenu = (): void => {
    if (typeof deps.hideTileActionMenu === "function") return deps.hideTileActionMenu();
    hideTileActionMenuFromModule(state, tileActionMenuEl);
  };

  const flowCtx: ActionFlowDeps & Record<string, any> = {
    ...deps,
    state,
    ws,
    wsUrl,
    techPickEl,
    mobileTechPickEl,
    tileActionMenuEl,
    holdBuildMenuEl,
    requireAuthedSession,
    sendGameMessage,
    requestTileDetailIfNeeded,
    sendAllianceRequest,
    sendTruceRequest,
    breakAlliance,
    breakTruce,
    activeTruceWithPlayer,
    chooseTech,
    explainActionFailure,
    hideHoldBuildMenu,
    hideTileActionMenu,
    renderHud,
    buildFortOnSelectedFromModule,
    settleSelectedFromModule,
    buildSiegeOutpostOnSelectedFromModule,
    uncaptureSelectedFromModule,
    cancelOngoingCaptureFromModule,
    collectVisibleYieldFromModule,
    collectSelectedYieldFromModule,
    collectSelectedShardFromModule
  };

  const queueFlow = createClientActionFlowQueue(flowCtx as any);
  Object.assign(flowCtx, queueFlow);

  const targetingFlow = createClientActionFlowTargeting(flowCtx as any);
  Object.assign(flowCtx, targetingFlow);

  const menuFlow = createClientActionFlowMenu(flowCtx as any);
  Object.assign(flowCtx, menuFlow);

  const dispatchFlow = createClientActionFlowDispatch(flowCtx as any);
  Object.assign(flowCtx, dispatchFlow);

  return {
    requireAuthedSession,
    sendGameMessage,
    requestTileDetailIfNeeded,
    sendAllianceRequest,
    sendTruceRequest,
    breakAlliance,
    breakTruce,
    activeTruceWithPlayer,
    chooseTech,
    explainActionFailure,
    hideHoldBuildMenu,
    hideTileActionMenu,
    ...queueFlow,
    ...targetingFlow,
    ...menuFlow,
    ...dispatchFlow,
    worldTileRawFromPointer: deps.worldTileRawFromPointer,
    computeDragPreview: deps.computeDragPreview
  };
};
