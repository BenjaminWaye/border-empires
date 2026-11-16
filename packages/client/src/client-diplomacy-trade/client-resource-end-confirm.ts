// "End supply" takes two separate taps. Accepting a resource offer re-renders
// its card as an active agreement with "End supply" where "Accept trade" was,
// so a double-tap on Accept used to end the paid-for supply at once.
/** A second tap sooner than this after arming is the same double-tap, not a confirmation. */
export const RESOURCE_END_CONFIRM_MIN_MS = 600;
/** Armed buttons fall back to "End supply" after this long. */
export const RESOURCE_END_CONFIRM_RESET_MS = 4_000;
const ARMED_LABEL = "Tap again to end supply";

/** True when this tap confirms ending the supply; otherwise arms (or ignores) it. */
export function confirmResourceEnd(button: HTMLButtonElement, now: number): boolean {
  const armedAt = Number(button.dataset.resourceEndArmedAt);
  if (Number.isFinite(armedAt) && button.dataset.resourceEndArmedAt) return now - armedAt >= RESOURCE_END_CONFIRM_MIN_MS;
  const label = button.textContent ?? "";
  button.dataset.resourceEndArmedAt = String(now);
  button.textContent = ARMED_LABEL;
  setTimeout(() => {
    if (button.dataset.resourceEndArmedAt !== String(now)) return;
    delete button.dataset.resourceEndArmedAt;
    button.textContent = label;
  }, RESOURCE_END_CONFIRM_RESET_MS);
  return false;
}
