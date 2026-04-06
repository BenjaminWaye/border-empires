import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_WIDTH, landBiomeAt, setWorldSeed, structureBuildGoldCost, structureCostDefinition, terrainAt } from "@border-empires/shared";
import { formatGoldAmount, isForestTile } from "./client-constants.js";
import { initClientDom } from "./client-dom.js";
import { createInitialState, storageSet } from "./client-state.js";
import type { Tile } from "./client-types.js";

type BuildableStructureId = "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | NonNullable<Tile["economicStructure"]>["type"];

export const createClientAppEnv = () => {
  const dom = initClientDom();
  const state = createInitialState();
  const miniMapReplayEl = document.createElement("div");
  miniMapReplayEl.id = "mini-map-replay";
  dom.miniMapWrapEl.appendChild(miniMapReplayEl);

  const firebaseConfig = (() => {
    const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";
    const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? "border-empires.firebaseapp.com";
    const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? "border-empires";
    const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? "1:979056688511:web:d0af9a130d6eabacf36e4a";
    if (!apiKey || !authDomain || !projectId || !appId) return undefined;
    const config: FirebaseOptions = { apiKey, authDomain, projectId, appId };
    const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? "border-empires.firebasestorage.app";
    const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? "979056688511";
    const measurementId = (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) ?? "G-8FH65YL4QD";
    if (storageBucket) config.storageBucket = storageBucket;
    if (messagingSenderId) config.messagingSenderId = messagingSenderId;
    if (measurementId) config.measurementId = measurementId;
    return config;
  })();

  const firebaseApp = firebaseConfig ? (getApps()[0] ?? initializeApp(firebaseConfig)) : undefined;
  const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : undefined;
  const googleProvider = firebaseAuth ? new GoogleAuthProvider() : undefined;

  dom.miniMapBase.width = dom.miniMapEl.width;
  dom.miniMapBase.height = dom.miniMapEl.height;
  const miniMapBaseCtx = dom.miniMapBase.getContext("2d");
  if (!miniMapBaseCtx) throw new Error("missing minimap base context");

  const defaultWsUrl = (() => {
    const isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0";
    if (isLocalHost) return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;
    return "wss://border-empires.fly.dev/ws";
  })();
  const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? defaultWsUrl;
  const ws = new WebSocket(wsUrl);

  const key = (x: number, y: number): string => `${x},${y}`;
  const parseKey = (value: string): { x: number; y: number } => {
    const [xs, ys] = value.split(",");
    return { x: Number(xs), y: Number(ys) };
  };
  const wrapX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;
  const wrapY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;
  const fullMapChunkRadius = Math.max(Math.ceil(WORLD_WIDTH / CHUNK_SIZE / 2), Math.ceil(WORLD_HEIGHT / CHUNK_SIZE / 2));

  const ownedStructureCount = (structureType: BuildableStructureId): number => {
    let count = 0;
    for (const tile of state.tiles.values()) {
      if (tile.ownerId !== state.me) continue;
      if (structureType === "FORT" && tile.fort) count += 1;
      else if (structureType === "OBSERVATORY" && tile.observatory) count += 1;
      else if (structureType === "SIEGE_OUTPOST" && tile.siegeOutpost) count += 1;
      else if (tile.economicStructure?.type === structureType) count += 1;
    }
    return count;
  };

  const structureGoldCost = (structureType: BuildableStructureId): number => structureBuildGoldCost(structureType, ownedStructureCount(structureType));
  const structureCostText = (structureType: BuildableStructureId, resourceOverride?: string): string => {
    const def = structureCostDefinition(structureType);
    const goldCost = structureGoldCost(structureType);
    if (resourceOverride) return `${goldCost} gold + ${resourceOverride}`;
    if (def.resourceCost) return `${goldCost} gold + ${def.resourceCost.amount} ${def.resourceCost.resource}`;
    return `${goldCost} gold`;
  };

  const formatManpowerAmount = (value: number): string => Math.round(value).toString();
  const rateToneClass = (rate: number): string => {
    if (rate > 0.001) return "positive";
    if (rate < -0.001) return "negative";
    return "neutral";
  };
  const formatCooldownShort = (remainingMs: number): string => {
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    if (minutes < 60) return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
  };
  const prettyToken = (value: string): string =>
    value
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  const terrainLabel = (x: number, y: number, terrain: Tile["terrain"]): string => {
    if (terrain !== "LAND") return terrain;
    const biome = landBiomeAt(x, y);
    if (biome === "GRASS") return isForestTile(x, y) ? "FOREST" : "GRASS";
    return "SAND";
  };

  return {
    dom,
    state,
    miniMapReplayEl,
    firebaseAuth,
    googleProvider,
    ws,
    wsUrl,
    miniMapBaseCtx,
    key,
    parseKey,
    wrapX,
    wrapY,
    fullMapChunkRadius,
    structureGoldCost,
    structureCostText,
    formatManpowerAmount,
    formatCooldownShort,
    prettyToken,
    terrainLabel,
    rateToneClass,
    formatGoldAmount,
    terrainAt,
    setWorldSeed,
    storageSet
  };
};

export type ClientAppEnv = ReturnType<typeof createClientAppEnv>;
