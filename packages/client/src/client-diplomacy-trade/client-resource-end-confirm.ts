// "End supply" takes two separate presses. Accepting a resource offer re-renders
// its card as an active agreement with "End supply" where "Accept trade" was,
// so a double-tap on Accept used to end the paid-for supply at once.
//
// The armed state is keyed by agreement id, not stored on the button: the trade
// screen rebuilds its agreement cards whenever coin, resources or supply change
// (about once a second while income ticks), which would otherwise disarm it.
/** A second press sooner than this after arming is the same double-tap, not a confirmation. */
export const RESOURCE_END_CONFIRM_MIN_MS = 600;
/** An armed End falls back to "End supply" after this long. */
export const RESOURCE_END_CONFIRM_RESET_MS = 4_000;
export const RESOURCE_END_ARMED_LABEL = "Confirm end supply";

// Bounded: one entry per agreement pressed, pruned once its window passes, cleared on screen close.
const armedAt = new Map<string, number>();
const prune = (now: number): void => {
  for (const [id, at] of armedAt) if (now - at >= RESOURCE_END_CONFIRM_RESET_MS) armedAt.delete(id);
};

/** What this press on an agreement's End button does. */
export function pressResourceEnd(agreementId: string, now: number): "armed" | "ignored" | "confirmed" {
  prune(now);
  const at = armedAt.get(agreementId);
  if (at === undefined) {
    armedAt.set(agreementId, now);
    return "armed";
  }
  if (now - at < RESOURCE_END_CONFIRM_MIN_MS) return "ignored";
  armedAt.delete(agreementId);
  return "confirmed";
}

export const resourceEndIsArmed = (agreementId: string, now: number): boolean => {
  const at = armedAt.get(agreementId);
  return at !== undefined && now - at < RESOURCE_END_CONFIRM_RESET_MS;
};

export const resetResourceEndConfirm = (): void => armedAt.clear();
