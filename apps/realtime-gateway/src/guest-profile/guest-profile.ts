import { displayNameKey } from "../display-name-uniqueness/display-name-uniqueness.js";
import { assignUniqueColor } from "../player-color-allocation/player-color-allocation.js";

export const guestDisplayName = (number: number): string => `House Noname ${number}`;

// The lowest number not already in use. Numbering keeps every guest name
// unique while staying instantly recognizable: anyone on the leaderboard or
// map called "House Noname 7" is a guest.
export const suggestGuestName = (takenNameKeys: ReadonlySet<string>): string => {
  for (let number = 1; ; number += 1) {
    const candidate = guestDisplayName(number);
    if (!takenNameKeys.has(displayNameKey(candidate))) return candidate;
  }
};

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
  onProvisioned: () => void;
};

// Gives a guest their name and colour at first login, in place of the name and
// colour step. The profile is stored as NOT complete: the guest is asked for a
// real name and colour when they save their empire, and that first choice
// must not count as a rename (only a rename of a complete profile does).
// Resolves to the new profile, or undefined when the player already has a
// name (a returning guest), in which case nothing changes.
export const provisionGuestProfile = (deps: ProvisionGuestProfileDeps, playerId: string): Promise<StoredProfileLike | undefined> =>
  deps.runExclusive(async () => {
    const existing = await deps.profileStore.get(playerId);
    if (existing?.name) return undefined;
    const name = suggestGuestName(await deps.buildTakenNameSet(playerId));
    const tileColor = existing?.tileColor ?? assignUniqueColor(playerId, await deps.buildTakenColorSet(playerId));
    const stored = await deps.profileStore.setProfile(playerId, name, tileColor, undefined, undefined, { profileComplete: false });
    deps.invalidateProfileCache(playerId);
    deps.profileOverrides.upsert(playerId, { name, tileColor, profileComplete: false });
    deps.broadcastStyle(playerId, name, tileColor);
    deps.onProvisioned();
    return stored;
  });
