// Admin-only long-press on the season-end "Vote for New Season" / "Vote cast
// (x/y)" button. Holding it for FORCE_HOLD_MS force-starts the next season
// (START_NEW_SEASON with force: true), bypassing the vote threshold. The
// gateway re-checks admin rights, so this is purely the client gesture.
export const FORCE_HOLD_MS = 1500;

export type ForceHoldOptions = {
  holdMs?: number;
  onForce: () => void;
};

export const attachSeasonForceHold = (button: HTMLButtonElement, options: ForceHoldOptions): void => {
  const holdMs = options.holdMs ?? FORCE_HOLD_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    button.classList.remove("is-holding");
  };

  button.style.setProperty("--se-hold-ms", `${holdMs}ms`);
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    cancel();
    delete button.dataset.seForceFired;
    button.classList.add("is-holding");
    timer = setTimeout(() => {
      timer = undefined;
      button.classList.remove("is-holding");
      // Swallow the click that follows the release so a completed hold on
      // the not-yet-voted button doesn't also cast a normal vote.
      button.dataset.seForceFired = "1";
      options.onForce();
    }, holdMs);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"] as const) button.addEventListener(type, cancel);
  // Long-press on touch opens the context menu / text selection otherwise.
  button.addEventListener("contextmenu", (event) => event.preventDefault());
};

// True when the click should be ignored because it ends a completed hold.
export const consumeForceHoldClick = (button: HTMLButtonElement): boolean => {
  if (button.dataset.seForceFired !== "1") return false;
  delete button.dataset.seForceFired;
  return true;
};
