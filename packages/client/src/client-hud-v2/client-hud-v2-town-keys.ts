// Town screen keys (docs/town-focus-plan.md): 1–4 pick Balanced, Growth, Levy or Commerce for the open town,
// and ← / → step to the previous or next town, so tuning many towns needs no mouse travel.
import { TOWN_FOCUSES } from "@border-empires/shared";
import { screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { myTowns, runTownFocusPick, stepTown } from "./client-hud-v2-town-runtime.js";

const typing = (target: EventTarget | null): boolean =>
  typeof HTMLElement !== "undefined" && target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** A modal sheet (effort confirm, salvage tribute, ...) is open over the screen: keys belong to it, not the town. */
const modalOpen = (): boolean => typeof document !== "undefined" && document.querySelector('[aria-modal="true"]') !== null;

/** The focus card is on screen (it is left out for an ungarrisoned town): a key must not change what cannot be seen. */
const focusCardShown = (): boolean => typeof document === "undefined" || document.querySelector("#v2t-left .v2tf") !== null;

/** Handles one keydown; returns true when the town screen used it. */
export const onTownKey = (deps: HudV2Deps, event: Pick<KeyboardEvent, "key" | "target" | "altKey" | "ctrlKey" | "metaKey">): boolean => {
  if (screen.id !== "town" || event.altKey || event.ctrlKey || event.metaKey || typing(event.target) || modalOpen()) return false;
  const index = ["1", "2", "3", "4"].indexOf(event.key);
  const focus = index >= 0 ? TOWN_FOCUSES[index] : undefined;
  if (focus) {
    if (!focusCardShown()) return false;
    runTownFocusPick(deps, focus);
    return true;
  }
  if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && myTowns(deps).length > 1) {
    stepTown(deps, event.key === "ArrowLeft" ? -1 : 1);
    return true;
  }
  return false;
};

export const installTownKeys = (deps: HudV2Deps): void => {
  // Capture phase, and stop the event: the map's own window keydown listener pans the camera on arrows, which
  // would fight the step to the next town.
  window.addEventListener("keydown", (event) => {
    if (!onTownKey(deps, event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
};
