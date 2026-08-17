import type { Auth } from "firebase/auth";
import { CLIENT_BUILD_VERSION } from "../client-build-version.js";
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { getCurrentFps } from "../client-fps-monitor/client-fps-monitor.js";
import type { ClientState } from "../client-state/client-state.js";
import type { FeedSeverity, FeedType } from "../client-types.js";

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

export type AuthDebugState = BridgeDebugState &
  Pick<ClientState, "activeBackend" | "connection" | "zoom">;

// One combined connection + account debug snapshot. Previously the
// connection-status fields lived in a separate card-building function with
// its own Copy button; merged here so there's one place to look and one
// Copy button to use.
export interface AuthDebugSnapshot {
  backendLabel: string;
  bridgeModeLabel: string;
  bootstrapLabel: string;
  acceptLatencyLabel: string;
  seasonId: string;
  runtimeFingerprint: string;
  snapshotLabel: string;
  initialTileCount: number;
  supportedMessageCount: number;
  clientBuildShortLabel: string;
  serverBuildLabel: string;
  buildMismatchLabel: string;
  wsLabel: string;
  firebaseProjectId: string;
  firebaseAuthDomain: string;
  authUid: string;
  authEmail: string;
  providerLabel: string;
  playerId: string;
  playerName: string;
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
  const runtimeFingerprint = state.bridgeDebugRuntimeFingerprint || "pending";
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
  const backendLabel = state.activeBackend;
  const bridgeModeLabel =
    state.bridgeDebugMode === "rewrite-gateway"
      ? "rewrite-gateway"
      : state.bridgeDebugMode === "legacy-server"
        ? "legacy-server"
        : "unknown";
  const acceptLatencyLabel =
    state.bridgeDebugAcceptLatencyP95Ms > 0
      ? `${Math.round(state.bridgeDebugAcceptLatencyP95Ms)}ms`
      : "n/a";
  const snapshotLabel = state.bridgeDebugSnapshotLabel || "n/a";
  const clientBuildShortLabel = CLIENT_BUILD_VERSION.slice(0, 8);
  const serverBuildLabel = state.bridgeDebugServerBuildSha
    ? state.bridgeDebugServerBuildSha.slice(0, 8)
    : "dev";
  const buildMatch =
    state.bridgeDebugServerBuildSha.length > 0 &&
    state.bridgeDebugServerBuildSha.startsWith(CLIENT_BUILD_VERSION);
  const buildMismatchLabel =
    state.bridgeDebugServerBuildSha.length > 0 && !buildMatch ? " ⚠ mismatch" : "";
  return {
    backendLabel,
    bridgeModeLabel,
    bootstrapLabel,
    acceptLatencyLabel,
    seasonId,
    runtimeFingerprint,
    snapshotLabel,
    initialTileCount: state.bridgeDebugInitialTileCount,
    supportedMessageCount: state.bridgeDebugSupportedMessageCount,
    clientBuildShortLabel,
    serverBuildLabel,
    buildMismatchLabel,
    wsLabel,
    firebaseProjectId,
    firebaseAuthDomain,
    authUid,
    authEmail,
    providerLabel,
    playerId,
    playerName,
    fpsLabel,
    zoomLabel,
    zoomRangeLabel
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
      `Backend ${details.backendLabel}`,
      `Bridge ${details.bridgeModeLabel}`,
      `Bootstrap ${details.bootstrapLabel}`,
      `Accept p95 ${details.acceptLatencyLabel}`,
      `Season ${details.seasonId}`,
      `Runtime ${details.runtimeFingerprint}`,
      `Snapshot ${details.snapshotLabel}`,
      `Tiles ${details.initialTileCount}`,
      `Msgs ${details.supportedMessageCount}`,
      `Server build ${details.serverBuildLabel}${details.buildMismatchLabel}`,
      `WS ${details.wsLabel}`,
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
      `Render FPS ${details.fpsLabel}`,
      `Zoom ${details.zoomLabel} (range ${details.zoomRangeLabel})`,
      `UA ${navigator.userAgent}`
    ].join("\n")
  );
};

export const authDebugHtml = (details: AuthDebugSnapshot): string => {
  return `
      <div class="bridge-debug-status" title="${details.wsLabel}">
        <button type="button" class="bridge-debug-copy-btn" data-copy-auth-debug>Copy Debug Info</button>
        <div><strong>Backend</strong> ${details.backendLabel}</div>
        <div><strong>Bridge</strong> ${details.bridgeModeLabel}</div>
        <div><strong>Bootstrap</strong> ${details.bootstrapLabel}</div>
        <div><strong>Accept p95</strong> ${details.acceptLatencyLabel}</div>
        <div><strong>Season</strong> ${details.seasonId}</div>
        <div><strong>Runtime</strong> ${details.runtimeFingerprint}</div>
        <div><strong>Snapshot</strong> ${details.snapshotLabel}</div>
        <div><strong>Tiles</strong> ${details.initialTileCount} · <strong>Msgs</strong> ${details.supportedMessageCount}</div>
        <div><strong>Client build</strong> ${details.clientBuildShortLabel}</div>
        <div><strong>Server build</strong> ${details.serverBuildLabel}${details.buildMismatchLabel}</div>
        <div class="bridge-debug-ws">${details.wsLabel}</div>
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

/** Binds the single Copy button rendered by authDebugHtml() within `root`. Recomputes the payload at click time (not baked into the DOM at render time) so it's always current. */
export const bindAuthDebugCopyButton = (
  root: ParentNode,
  args: {
    state: AuthDebugState;
    wsUrl: string;
    firebaseAuth: Auth | null | undefined;
    pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
    onCopied: () => void;
  }
): void => {
  const { state, wsUrl, firebaseAuth, pushFeed, onCopied } = args;
  (root.querySelectorAll("[data-copy-auth-debug]") as NodeListOf<HTMLButtonElement>).forEach((btn) => {
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(decodeURIComponent(authDebugCopyPayload(state, authDebugSnapshot(state, wsUrl, firebaseAuth))));
        pushFeed("Debug info copied.", "info", "success");
      } catch {
        pushFeed("Could not copy debug info.", "error", "warn");
      }
      onCopied();
    };
  });
};
