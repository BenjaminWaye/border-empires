import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";
import { isStagingHostname, selectBackend } from "../client-backend-selector/client-backend-selector.js";
import { createMultiplexWebSocket } from "../client-multiplex-websocket/client-multiplex-websocket.js";
import type { ClientState } from "../client-state/client-state.js";

// The default Firebase authDomain (border-empires.firebaseapp.com) is a
// different origin than the app itself (play.borderempires.com /
// staging.borderempires.com). Google sign-in's OAuth handshake round-trips
// through that authDomain's /__/auth/handler page, which needs
// sessionStorage to track the pending operation — and mobile browsers
// increasingly partition/block storage for that kind of third-party
// context, surfacing as Firebase's raw "auth/missing-initial-state" error.
// vercel.json proxies /__/auth/* and /__/firebase/* back to
// border-empires.firebaseapp.com so the handler can be served from the
// app's own origin instead; defaulting authDomain to the current hostname
// here (for real deployed hosts, not local dev where there's no proxy)
// makes that handler traffic first-party and avoids the partitioning
// entirely.
const FALLBACK_AUTH_DOMAIN = "border-empires.firebaseapp.com";

const defaultAuthDomain = (): string => {
  if (typeof window === "undefined") return FALLBACK_AUTH_DOMAIN;
  const hostname = window.location.hostname.toLowerCase();
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  return isLocalHost ? FALLBACK_AUTH_DOMAIN : hostname;
};

export const createClientFirebaseSetup = (): {
  firebaseAuth: ReturnType<typeof getAuth> | undefined;
  googleProvider: GoogleAuthProvider | undefined;
} => {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";
  const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? defaultAuthDomain();
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? "border-empires";
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? "1:979056688511:web:d0af9a130d6eabacf36e4a";
  if (!apiKey || !authDomain || !projectId || !appId) {
    return { firebaseAuth: undefined, googleProvider: undefined };
  }

  const firebaseConfig: FirebaseOptions = { apiKey, authDomain, projectId, appId };
  const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? "border-empires.firebasestorage.app";
  const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? "979056688511";
  const measurementId = (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) ?? "G-8FH65YL4QD";
  if (storageBucket) firebaseConfig.storageBucket = storageBucket;
  if (messagingSenderId) firebaseConfig.messagingSenderId = messagingSenderId;
  if (measurementId) firebaseConfig.measurementId = measurementId;

  const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
  const firebaseAuth = getAuth(firebaseApp);
  return {
    firebaseAuth,
    googleProvider: new GoogleAuthProvider()
  };
};

export const createClientSocketSetup = (
  state: ClientState
): {
  ws: ReturnType<typeof createMultiplexWebSocket>;
  wsUrl: string;
} => {
  const hostname = window.location.hostname.toLowerCase();
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0";
  const isStagingHost = isStagingHostname(hostname);

  // Legacy monolith URL — retained for explicit ?backend=legacy / be-backend=legacy
  // overrides only. The legacy `border-empires.fly.dev` Fly app has been retired
  // and no longer resolves; nothing should reach it via the default path.
  const legacyDefault = isLocalHost
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://127.0.0.1:3001/ws`
    : "wss://border-empires.fly.dev/ws";
  const legacyWsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? legacyDefault;

  // Rewrite gateway URL. Every non-local hostname now has a baked default so
  // the prod client (play.borderempires.com) cannot fall through to the dead
  // legacy URL when VITE_GATEWAY_WS_URL is missing from the Vercel build env.
  const gatewayDefault = isLocalHost
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://127.0.0.1:3101/ws`
    : isStagingHost
      ? "wss://border-empires-combined-staging.fly.dev/ws"
      : "wss://border-empires-combined.fly.dev/ws";
  const gatewayWsUrl =
    (import.meta.env.VITE_GATEWAY_WS_URL as string | undefined) ?? gatewayDefault;

  const envDefaultBackendRaw = (import.meta.env.VITE_BACKEND_DEFAULT as string | undefined)?.toLowerCase();
  const envDefaultBackend =
    envDefaultBackendRaw === "gateway" || envDefaultBackendRaw === "legacy" ? envDefaultBackendRaw : undefined;

  // Priority: ?backend= URL param > be-backend cookie > env default.
  const selection = selectBackend({
    legacyWsUrl,
    gatewayWsUrl,
    ...(envDefaultBackend ? { envDefaultBackend } : {})
  });
  const { wsUrl, backend } = selection;

  state.localhostDevAetherWall = isLocalHost;
  state.activeBackend = backend;
  state.bridgeDebugWsUrl = wsUrl;
  state.bridgeDebugMode = backend === "gateway" ? "rewrite-gateway" : "legacy-server";
  return {
    ws: createMultiplexWebSocket(wsUrl),
    wsUrl
  };
};
