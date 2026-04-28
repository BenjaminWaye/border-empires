import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";
import { selectBackend } from "./client-backend-selector.js";
import { createMultiplexWebSocket } from "./client-multiplex-websocket.js";
import type { ClientState } from "./client-state.js";

export const createClientFirebaseSetup = (): {
  firebaseAuth: ReturnType<typeof getAuth> | undefined;
  googleProvider: GoogleAuthProvider | undefined;
} => {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";
  const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? "border-empires.firebaseapp.com";
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
  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "0.0.0.0";

  // Legacy monolith URL — prod default stays wss://border-empires.fly.dev/ws until Phase 6.
  const legacyDefault = isLocalHost
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://127.0.0.1:3001/ws`
    : "wss://border-empires.fly.dev/ws";
  const legacyWsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? legacyDefault;

  // Rewrite gateway URL — VITE_GATEWAY_WS_URL is undefined in prod until Phase 6.
  const gatewayDefault = isLocalHost
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://127.0.0.1:3101/ws`
    : undefined;
  const gatewayWsUrl =
    (import.meta.env.VITE_GATEWAY_WS_URL as string | undefined) ?? gatewayDefault ?? legacyWsUrl;

  // Priority: ?backend= URL param > be-backend cookie > env default.
  const selection = selectBackend({ legacyWsUrl, gatewayWsUrl });
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
