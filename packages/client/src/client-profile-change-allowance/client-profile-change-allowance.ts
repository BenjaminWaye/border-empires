// Name, colour and crest can each be changed once per Sector Contest, each
// with its own allowance (enforced by the gateway: profile-change-allowance.ts
// there). The gateway says which are spent -- INIT (name, colour), PLAYER_UPDATE
// after a change, COSMETICS_STATE (crest) -- and the limit refusals say so too.
// The Edit Name, Colour & Crest dialog reads this to label each field
// ("Name · 1 change left", "Crest · used") and disable a used one.
// Unknown (an older gateway, or before the reply) shows no label and never disables.

export type ProfileChangeField = "name" | "color" | "crest";

type Allowance = Partial<Record<ProfileChangeField, boolean>>;

let used: Allowance = {};

const FLAG: Record<ProfileChangeField, string> = { name: "nameChangeUsed", color: "colorChangeUsed", crest: "crestChangeUsed" };

/** Reads the `…ChangeUsed` flags present on a gateway message; absent ones keep what is known. */
export const applyProfileChangeAllowance = (source: Record<string, unknown>): void => {
  for (const field of Object.keys(FLAG) as ProfileChangeField[]) {
    const value = source[FLAG[field]];
    if (typeof value === "boolean") used = { ...used, [field]: value };
  }
};

/** INIT: a new session (maybe another account): forget everything, then read the INIT flags. */
export const resetProfileChangeAllowance = (source: Record<string, unknown> = {}): void => {
  used = {};
  applyProfileChangeAllowance(source);
};

/** The gateway refused a change because it was already spent. */
export const markProfileChangeUsed = (field: ProfileChangeField): void => {
  used = { ...used, [field]: true };
};

/** True / false when the gateway said; undefined when unknown. */
export const profileChangeUsed = (field: ProfileChangeField): boolean | undefined => used[field];

const LABEL: Record<ProfileChangeField, string> = { name: "Name", color: "Colour", crest: "Crest" };

/** "Name · 1 change left" / "Name · used"; "" while unknown. */
export const profileChangeAllowanceLabel = (field: ProfileChangeField): string => {
  const spent = used[field];
  if (spent === undefined) return "";
  return `${LABEL[field]} · ${spent ? "used" : "1 change left"}`;
};

/** INIT and PLAYER_UPDATE: the suggested colour swatches and the allowance flags (lifted out of the over-limit network files). */
export const applyPlayerProfileFields = (state: { suggestedColors: string[] }, source: Record<string, unknown>, init: boolean): void => {
  if (Array.isArray(source.suggestedColors)) state.suggestedColors = source.suggestedColors as string[];
  if (init) resetProfileChangeAllowance(source);
  else applyProfileChangeAllowance(source);
};
