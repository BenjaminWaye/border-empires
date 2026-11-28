import { defaultHouseCrestFor, type CrestCosmeticId } from "@border-empires/shared";

import { suggestHouseName } from "../display-name-uniqueness/display-name-uniqueness.js";
import { assignUniqueColor } from "../player-color-allocation/player-color-allocation.js";

// A guest gets a House name like any other House ("House Ashgrove"), free of
// every name held or reserved (owner decision 2026-11-28; it replaced
// "House Noname <n>", which guests who already hold one keep).
export const suggestGuestName = (takenNameKeys: ReadonlySet<string>, random: () => number = Math.random): string =>
  suggestHouseName(takenNameKeys, random);

type StoredProfileLike = { name?: string; tileColor?: string; profileComplete?: boolean };

export type ProvisionGuestProfileDeps = {
  profileStore: {
    get: (playerId: string) => Promise<StoredProfileLike | undefined>;
    setProfile: (
      playerId: string,
      name: string,
      tileColor: string,
      nameChangedSeasonId: string | undefined,
      colorChangedSeasonId: string | undefined,
      options: { profileComplete: boolean }
    ) => Promise<StoredProfileLike>;
  };
  profileOverrides: { upsert: (playerId: string, patch: { name: string; tileColor: string; profileComplete: boolean }) => unknown };
  buildTakenNameSet: (excludePlayerId: string) => Promise<Set<string>>;
  buildTakenColorSet: (excludePlayerId: string) => Promise<Set<string>>;
  runExclusive: <T>(task: () => Promise<T>) => Promise<T>;
  invalidateProfileCache: (playerId: string) => void;
  broadcastStyle: (playerId: string, name: string, tileColor: string) => void;
  /** Gives the House a crest unless it already shows one (account-cosmetics-service.ts). */
  assignDefaultCrest?: (playerId: string, crest: CrestCosmeticId) => Promise<unknown>;
  onProvisioned: () => void;
  random?: () => number;
};

// Gives a guest their name, colour and crest at first login, in place of the name and
// colour step. The profile is stored as NOT complete: the guest is asked for a
// real name and colour when they save their empire, and that first choice
// must not count as a rename (only a rename of a complete profile does).
// Resolves to the new profile, or undefined when the player already has a
// name (a returning guest), in which case nothing changes.
export const provisionGuestProfile = (deps: ProvisionGuestProfileDeps, playerId: string): Promise<StoredProfileLike | undefined> =>
  deps.runExclusive(async () => {
    const existing = await deps.profileStore.get(playerId);
    if (existing?.name) return undefined;
    const name = suggestGuestName(await deps.buildTakenNameSet(playerId), deps.random);
    const tileColor = existing?.tileColor ?? assignUniqueColor(playerId, await deps.buildTakenColorSet(playerId));
    const stored = await deps.profileStore.setProfile(playerId, name, tileColor, undefined, undefined, { profileComplete: false });
    deps.invalidateProfileCache(playerId);
    deps.profileOverrides.upsert(playerId, { name, tileColor, profileComplete: false });
    deps.broadcastStyle(playerId, name, tileColor);
    await deps.assignDefaultCrest?.(playerId, defaultHouseCrestFor(playerId));
    deps.onProvisioned();
    return stored;
  });
