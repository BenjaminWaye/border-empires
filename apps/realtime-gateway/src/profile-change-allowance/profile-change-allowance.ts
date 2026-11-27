// Name, colour and crest can each be changed once per Sector Contest (owner
// rule, 2026-11-27). Each has its own allowance, keyed by the season id the
// change was made in: the name and colour in the profile row
// (nameChangedSeasonId / colorChangedSeasonId, handle-set-profile-message.ts),
// the crest in the cosmetics store (account-cosmetics-service.ts). The first
// profile setup never spends one. The client reads these flags (INIT and the
// replies to each change) to show what is left and to disable a used field.

export type ProfileChangeField = "name" | "color" | "crest";

/** Short reasons for the refusals (ERROR DISPLAY_NAME_LIMIT / COLOR_LIMIT / COSMETIC_LIMIT). */
export const PROFILE_CHANGE_LIMIT_REASON: Record<ProfileChangeField, string> = {
  name: "Name already changed this contest.",
  color: "Colour already changed this contest.",
  crest: "Crest already changed this contest."
};

/** True when `changedSeasonId` is the current contest: that field's change is spent. */
export const profileChangeUsed = (changedSeasonId: string | undefined, currentSeasonId: string | undefined): boolean =>
  Boolean(currentSeasonId) && changedSeasonId === currentSeasonId;

export const profileChangeAllowanceFields = (
  profile: { nameChangedSeasonId?: string; colorChangedSeasonId?: string } | undefined,
  currentSeasonId: string | undefined
): { nameChangeUsed: boolean; colorChangeUsed: boolean } => ({
  nameChangeUsed: profileChangeUsed(profile?.nameChangedSeasonId, currentSeasonId),
  colorChangeUsed: profileChangeUsed(profile?.colorChangedSeasonId, currentSeasonId)
});
