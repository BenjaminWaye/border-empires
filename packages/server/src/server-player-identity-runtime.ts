import type { Player, TileKey } from "@border-empires/shared";

import type { AuthIdentity } from "./server-auth.js";

export interface CreateServerPlayerIdentityRuntimeDeps {
  players: Map<string, Player>;
  authIdentityByUid: Map<string, AuthIdentity>;
  AI_PLAYERS: number;
  FOG_ADMIN_EMAIL: string;
  STARTING_GOLD: number;
  STARTING_MANPOWER: number;
  STAMINA_MAX: number;
  colorFromId: (id: string) => string;
  defaultMissionStats: () => Player["missionStats"];
  now: () => number;
  randomUUID: () => string;
  initializeAiPlayerRuntimeState: (player: Player) => void;
  cleanupRemovedAiPlayer: (playerId: string) => void;
}

export interface ServerPlayerIdentityRuntime {
  normalizedPlayerHandle: (name: string) => string;
  uniquePlayerName: (uid: string, preferred: string) => string;
  claimPlayerName: (playerId: string, preferred: string) => string;
  playerHasFogAdminAccess: (playerId: string) => boolean;
  ensureAiPlayers: () => void;
}

const AI_SINGLE_NAMES = ["Conan", "Boudica", "Ragnar", "Nyx", "Ivar", "Brakka", "Skarn", "Valka", "Torvin", "Morrigan", "Korga", "Thyra"] as const;
const AI_NAME_PREFIXES = ["Bastard", "Iron", "Wolf", "Raven", "Blood", "Ash", "Bone", "Storm", "Night", "Skull", "Dread", "Black"] as const;
const AI_NAME_SUFFIXES = ["Cleaver", "Reaver", "Fang", "Hammer", "Render", "Maw", "Howl", "Breaker", "Warden", "Rider", "Seer", "Brand"] as const;

const randomFrom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

export const createServerPlayerIdentityRuntime = (
  deps: CreateServerPlayerIdentityRuntimeDeps
): ServerPlayerIdentityRuntime => {
  const normalizedPlayerHandle = (name: string): string => {
    const cleaned = name.replace(/\s+/g, " ").trim();
    if (!cleaned) return "Empire";
    return cleaned.slice(0, 24);
  };

  const playerNameTaken = (candidate: string, excludePlayerId?: string): boolean => {
    for (const player of deps.players.values()) {
      if (excludePlayerId && player.id === excludePlayerId) continue;
      if (player.name === candidate) return true;
    }
    return false;
  };

  const uniquePlayerName = (uid: string, preferred: string): string => {
    const base = normalizedPlayerHandle(preferred);
    const existingIdentity = deps.authIdentityByUid.get(uid);
    if (existingIdentity) return existingIdentity.name;
    let candidate = base;
    let suffix = 2;
    while (playerNameTaken(candidate)) {
      candidate = `${base.slice(0, Math.max(1, 24 - String(suffix).length - 1))}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  const claimPlayerName = (playerId: string, preferred: string): string => {
    const base = normalizedPlayerHandle(preferred);
    let candidate = base;
    let suffix = 2;
    while (playerNameTaken(candidate, playerId)) {
      candidate = `${base.slice(0, Math.max(1, 24 - String(suffix).length - 1))}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  const generateAiNickname = (): string => {
    for (let i = 0; i < 24; i += 1) {
      const preferred =
        Math.random() < 0.35
          ? randomFrom(AI_SINGLE_NAMES)
          : `${randomFrom(AI_NAME_PREFIXES)}${randomFrom(AI_NAME_SUFFIXES)}`;
      if (!playerNameTaken(preferred)) return preferred;
    }
    return `${randomFrom(AI_NAME_PREFIXES)}${randomFrom(AI_NAME_SUFFIXES)}`;
  };

  const aiHasPlaceholderName = (name: string): boolean => /^AI Empire \d+$/.test(name);

  const playerHasFogAdminAccess = (playerId: string): boolean => {
    for (const identity of deps.authIdentityByUid.values()) {
      if (identity.playerId !== playerId) continue;
      return identity.email?.toLowerCase() === deps.FOG_ADMIN_EMAIL;
    }
    return false;
  };

  const ensureAiPlayers = (): void => {
    const existing = [...deps.players.values()].filter((player) => player.isAi);
    if (existing.length > deps.AI_PLAYERS) {
      for (const player of existing.slice(deps.AI_PLAYERS)) {
        deps.players.delete(player.id);
        deps.cleanupRemovedAiPlayer(player.id);
      }
    }
    if (deps.AI_PLAYERS <= 0) return;
    for (const player of existing) {
      if (!aiHasPlaceholderName(player.name)) continue;
      player.name = claimPlayerName(player.id, generateAiNickname());
    }
    for (let i = existing.length; i < deps.AI_PLAYERS; i += 1) {
      const id = deps.randomUUID();
      const player: Player = {
        id,
        name: claimPlayerName(id, generateAiNickname()),
        isAi: true,
        profileComplete: true,
        points: deps.STARTING_GOLD,
        level: 0,
        techIds: new Set<string>(),
        domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        powerups: {},
        tileColor: deps.colorFromId(id),
        missions: [],
        missionStats: deps.defaultMissionStats(),
        territoryTiles: new Set<TileKey>(),
        T: 0,
        E: 0,
        Ts: 0,
        Es: 0,
        stamina: deps.STAMINA_MAX,
        staminaUpdatedAt: deps.now(),
        manpower: deps.STARTING_MANPOWER,
        manpowerUpdatedAt: deps.now(),
        manpowerCapSnapshot: deps.STARTING_MANPOWER,
        allies: new Set<string>(),
        spawnShieldUntil: deps.now() + 120_000,
        isEliminated: false,
        respawnPending: false,
        lastActiveAt: deps.now(),
        lastEconomyWakeAt: deps.now(),
        activityInbox: []
      };
      deps.players.set(id, player);
      deps.initializeAiPlayerRuntimeState(player);
    }
  };

  return {
    normalizedPlayerHandle,
    uniquePlayerName,
    claimPlayerName,
    playerHasFogAdminAccess,
    ensureAiPlayers
  };
};
