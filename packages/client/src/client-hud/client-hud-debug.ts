import type { Auth } from "firebase/auth";
import { CLIENT_BUILD_VERSION } from "../client-build-version.js";
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { getCurrentFps } from "../client-fps-monitor/client-fps-monitor.js";
import type { ClientState } from "../client-state/client-state.js";

export type BridgeDebugState = Pick<
  ClientState,
  | "bridgeDebugMode"
  | "bridgeDebugBootstrap"
  | "bridgeDebugServerBuildSha"
  | "bridgeDebugSeasonId"
  | "bridgeDebugRuntimeFingerprint"
  | "bridgeDebugSnapshotLabel"
  | "bridgeDebugWsUrl"
  | "bridgeDebugInitialTileCount"
  | "bridgeDebugSupportedMessageCount"
  | "bridgeDebugAcceptLatencyP95Ms"
  | "activeBackend"
  | "me"
  | "meName"
  | "authReady"
  | "authSessionReady"
  | "profileSetupRequired"
>;

export const bridgeStatusHtml = (
  state: BridgeDebugState,
  wsUrl: string
): string => {
  const modeLabel =
    state.bridgeDebugMode === "rewrite-gateway"
      ? "rewrite-gateway"
      : state.bridgeDebugMode === "legacy-server"
        ? "legacy-server"
        : "unknown";
  const bootstrapLabel =
    state.bridgeDebugBootstrap === "rewrite-init"
      ? "rewrite-init"
      : state.bridgeDebugBootstrap === "legacy-init"
        ? "legacy-init"
        : "pending";
  const wsLabel = state.bridgeDebugWsUrl || wsUrl;
  const seasonLabel = state.bridgeDebugSeasonId || "unknown";
  const runtimeFingerprint = state.bridgeDebugRuntimeFingerprint || "unknown";
  const snapshotLabel = state.bridgeDebugSnapshotLabel || "n/a";
  const backendLabel = state.activeBackend;
  const acceptLatencyLabel =
    state.bridgeDebugAcceptLatencyP95Ms > 0
      ? `${Math.round(state.bridgeDebugAcceptLatencyP95Ms)}ms`
      : "n/a";
  const clientBuildShortLabel = CLIENT_BUILD_VERSION.slice(0, 8);
  const serverBuildLabel = state.bridgeDebugServerBuildSha
    ? state.bridgeDebugServerBuildSha.slice(0, 8)
    : "dev";
  const buildMatch =
    state.bridgeDebugServerBuildSha.length > 0 &&
    state.bridgeDebugServerBuildSha.startsWith(CLIENT_BUILD_VERSION);
  const buildMismatchLabel =
    state.bridgeDebugServerBuildSha.length > 0 && !buildMatch
      ? " ⚠ mismatch"
      : "";
  const copyPayload = encodeURIComponent(
    [
      `Backend ${backendLabel}`,
      `Bridge ${modeLabel}`,
      `Bootstrap ${bootstrapLabel}`,
      `Accept p95 ${acceptLatencyLabel}`,
      `Season ${seasonLabel}`,
      `Runtime ${runtimeFingerprint}`,
      `Snapshot ${snapshotLabel}`,
      `Tiles ${state.bridgeDebugInitialTileCount}`,
      `Msgs ${state.bridgeDebugSupportedMessageCount}`,
      `Client build ${clientBuildShortLabel}`,
      `Server build ${serverBuildLabel}${buildMismatchLabel}`,
      wsLabel,
    ].join("\n")
  );
  return `
      <div class="bridge-debug-status" title="${wsLabel}">
        <button type="button" class="bridge-debug-copy-btn" data-copy-bridge-debug="${copyPayload}">Copy</button>
        <div><strong>Backend</strong> ${backendLabel}</div>
        <div><strong>Bridge</strong> ${modeLabel}</div>
        <div><strong>Bootstrap</strong> ${bootstrapLabel}</div>
        <div><strong>Accept p95</strong> ${acceptLatencyLabel}</div>
        <div><strong>Season</strong> ${seasonLabel}</div>
        <div><strong>Runtime</strong> ${runtimeFingerprint}</div>
        <div><strong>Snapshot</strong> ${snapshotLabel}</div>
        <div><strong>Tiles</strong> ${state.bridgeDebugInitialTileCount} · <strong>Msgs</strong> ${state.bridgeDebugSupportedMessageCount}</div>
        <div><strong>Server build</strong> ${serverBuildLabel}${buildMismatchLabel}</div>
        <div class="bridge-debug-ws">${wsLabel}</div>
      </div>
    `;
};

export type AuthDebugState = BridgeDebugState &
  Pick<ClientState, "activeBackend" | "connection" | "zoom">;

export interface AuthDebugSnapshot {
  firebaseProjectId: string;
  firebaseAuthDomain: string;
  authUid: string;
  authEmail: string;
  providerLabel: string;
  playerId: string;
  playerName: string;
  runtimeFingerprint: string;
  seasonId: string;
  bootstrapLabel: string;
  wsLabel: string;
  fpsLabel: string;
  zoomLabel: string;
  zoomRangeLabel: string;
}

export const authDebugSnapshot = (
  state: AuthDebugState,
  wsUrl: string,
  firebaseAuth: Auth | null | undefined
): AuthDebugSnapshot => {
  const currentUser = firebaseAuth?.currentUser;
  const firebaseProjectId =
    (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ??
    "border-empires";
  const firebaseAuthDomain =
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ??
    "border-empires.firebaseapp.com";
  const authUid = currentUser?.uid ?? "none";
  const authEmail = currentUser?.email?.trim() || "none";
  const authProviders =
    currentUser?.providerData
      ?.map((entry) => entry.providerId)
      .filter((entry): entry is string => Boolean(entry)) ?? [];
  const providerLabel =
    authProviders.length > 0 ? authProviders.join(", ") : "none";
  const playerId = state.me || "pending";
  const playerName = state.meName || "pending";
  const runtimeFingerprint =
    state.bridgeDebugRuntimeFingerprint || "pending";
  const seasonId = state.bridgeDebugSeasonId || "pending";
  const bootstrapLabel =
    state.bridgeDebugBootstrap === "rewrite-init"
      ? "rewrite-init"
      : state.bridgeDebugBootstrap === "legacy-init"
        ? "legacy-init"
        : "pending";
  const wsLabel = state.bridgeDebugWsUrl || wsUrl;
  const fps = getCurrentFps();
  const fpsLabel = fps === undefined ? "—" : Math.round(fps).toString();
  const zoomLabel = Math.round(state.zoom).toString();
  const zoomRangeLabel = `${MIN_ZOOM}–${MAX_ZOOM}`;
  return {
    firebaseProjectId,
    firebaseAuthDomain,
    authUid,
    authEmail,
    providerLabel,
    playerId,
    playerName,
    runtimeFingerprint,
    seasonId,
    bootstrapLabel,
    wsLabel,
    fpsLabel,
    zoomLabel,
    zoomRangeLabel,
  };
};

export const authDebugCopyPayload = (
  state: AuthDebugState,
  details: AuthDebugSnapshot
): string => {
  return encodeURIComponent(
    [
      `Client build ${CLIENT_BUILD_VERSION}`,
      `Host ${window.location.host}`,
      `Path ${window.location.pathname}${window.location.search}`,
      `Firebase project ${details.firebaseProjectId}`,
      `Firebase auth domain ${details.firebaseAuthDomain}`,
      `Auth uid ${details.authUid}`,
      `Auth email ${details.authEmail}`,
      `Providers ${details.providerLabel}`,
      `Game playerId ${details.playerId}`,
      `Game playerName ${details.playerName}`,
      `Auth ready ${state.authReady}`,
      `Auth session ready ${state.authSessionReady}`,
      `Profile setup required ${state.profileSetupRequired}`,
      `Backend ${state.activeBackend}`,
      `Bridge ${state.bridgeDebugMode || "unknown"}`,
      `Bootstrap ${details.bootstrapLabel}`,
      `Render FPS ${details.fpsLabel}`,
      `Zoom ${details.zoomLabel} (range ${details.zoomRangeLabel})`,
      `Season ${details.seasonId}`,
      `Runtime ${details.runtimeFingerprint}`,
      `WS ${details.wsLabel}`,
      `UA ${navigator.userAgent}`,
    ].join("\n")
  );
};

export const authDebugHtml = (details: AuthDebugSnapshot): string => {
  return `
      <div class="bridge-debug-status auth-debug-status" title="${details.authUid}">
        <button type="button" class="bridge-debug-copy-btn" data-copy-auth-debug>Copy Auth Debug</button>
        <div><strong>Firebase</strong> ${details.firebaseProjectId}</div>
        <div><strong>UID</strong> ${details.authUid}</div>
        <div><strong>Email</strong> ${details.authEmail}</div>
        <div><strong>Providers</strong> ${details.providerLabel}</div>
        <div><strong>Player</strong> ${details.playerId} · ${details.playerName}</div>
        <div><strong>Render FPS</strong> <span data-fps-readout>${details.fpsLabel}</span></div>
        <div><strong>Zoom</strong> <span data-zoom-readout>${details.zoomLabel}</span> <span class="bridge-debug-zoom-range">(range ${details.zoomRangeLabel})</span></div>
      </div>
    `;
};
