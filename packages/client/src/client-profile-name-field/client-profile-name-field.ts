// Shared behaviour for the two empire-name boxes: "Found your first standard"
// (#auth-profile-name) and Settings > Account > Edit Name & Colour.
//
// Both open pre-filled (a server-suggested name, or the current name). On a
// phone a tap puts the caret at the end, so typing appended to the
// suggestion and maxlength silently cut the result off ("House
// BlackcrestHouse Ma", 2026-11 playtest). Focusing the box now selects the
// whole value so typing replaces it, and an n/24 count sits under the box.
//
// The founding box also keeps a per-tab draft (sessionStorage) of what the
// player typed, so a dropped connection + reload before "Enter the map"
// restores their name instead of the server's suggestion.

export const PROFILE_NAME_MAX_LENGTH = 24;
const FOUNDING_NAME_DRAFT_KEY = "border-empires:founding-name-draft";

/** Markup for the n/24 count shown under a name box (filled in by syncProfileNameCount). */
export const profileNameCountHtml = (id?: string): string =>
  `<span class="profile-name-count"${id ? ` id="${id}"` : ""} data-profile-name-count aria-live="polite">0/${PROFILE_NAME_MAX_LENGTH}</span>`;

/**
 * Updates the count next to `input`. Safe for inputs without a count, or test fakes without a DOM parent.
 * With `emptyHint`, an empty box shows the hint instead of "0/24": in Edit Name the box starts empty
 * and keeps the current name, and "0/24" read as if saving would wipe it (playtest 2026-11-27).
 */
export const syncProfileNameCount = (input: Pick<HTMLInputElement, "value"> & { parentElement?: Element | null }, emptyHint?: string): void => {
  const counter = input.parentElement?.querySelector<HTMLElement>("[data-profile-name-count]");
  if (counter) counter.textContent = emptyHint && input.value.length === 0 ? emptyHint : `${input.value.length}/${PROFILE_NAME_MAX_LENGTH}`;
};

const selectAll = (input: HTMLInputElement): void => {
  try {
    input.setSelectionRange(0, input.value.length);
  } catch {
    input.select();
  }
};

/**
 * Select-all on focus, so typing replaces the pre-filled name, plus a live
 * count. Mobile browsers move the caret to the tap point on the mouseup that
 * follows focus, so that first mouseup is cancelled and the selection redone;
 * later taps inside the focused box place the caret normally.
 */
export const bindProfileNameField = (input: HTMLInputElement, options: { onUserInput?: (value: string) => void; emptyHint?: string } = {}): void => {
  let reselectOnPointerUp = false;
  input.addEventListener("focus", () => {
    selectAll(input);
    reselectOnPointerUp = true;
  });
  input.addEventListener("mouseup", (event) => {
    if (!reselectOnPointerUp) return;
    reselectOnPointerUp = false;
    event.preventDefault();
    selectAll(input);
  });
  input.addEventListener("keydown", () => {
    reselectOnPointerUp = false;
  });
  input.addEventListener("blur", () => {
    reselectOnPointerUp = false;
  });
  input.addEventListener("input", () => {
    syncProfileNameCount(input, options.emptyHint);
    options.onUserInput?.(input.value);
  });
  syncProfileNameCount(input, options.emptyHint);
};

const sessionStore = (): Storage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
};

/** The name the player typed on the founding screen this tab session, or "". */
export const readFoundingNameDraft = (): string => {
  try {
    return (sessionStore()?.getItem(FOUNDING_NAME_DRAFT_KEY) ?? "").trim().slice(0, PROFILE_NAME_MAX_LENGTH);
  } catch {
    return "";
  }
};

export const writeFoundingNameDraft = (value: string): void => {
  try {
    const store = sessionStore();
    if (!store) return;
    const cleaned = value.trim();
    if (cleaned) store.setItem(FOUNDING_NAME_DRAFT_KEY, cleaned.slice(0, PROFILE_NAME_MAX_LENGTH));
    else store.removeItem(FOUNDING_NAME_DRAFT_KEY);
  } catch {
    // Storage blocked (private mode, webview): the draft is a convenience only.
  }
};

export const clearFoundingNameDraft = (): void => {
  try {
    sessionStore()?.removeItem(FOUNDING_NAME_DRAFT_KEY);
  } catch {
    // See writeFoundingNameDraft.
  }
};
