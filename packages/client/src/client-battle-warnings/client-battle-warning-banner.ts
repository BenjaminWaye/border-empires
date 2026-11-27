// The "Under attack" HUD banner (view model: client-battle-warnings.ts).
// One tappable strip at the top of the screen in both renderers; tapping it
// centers the camera on the latest fight (the same camera move as the
// Activity Feed's "Center" buttons, client-hud.ts) and hides it until the
// next loss or incoming attack.
import type { ClientState } from "../client-state/client-state.js";
import { dismissBattleWarning, type BattleWarningStore, type BattleWarningView } from "./client-battle-warnings.js";

export const BATTLE_WARNING_BANNER_ID = "battle-warning-banner";

type CameraState = Pick<ClientState, "camX" | "camY" | "camSubX" | "camSubY" | "selected">;

export type BattleWarningBanner = {
  readonly sync: (view: BattleWarningView | undefined) => void;
};

/** Centers the camera on (x, y) and selects that tile. */
export const jumpCameraToBattle = (state: CameraState, x: number, y: number): void => {
  state.camX = x;
  state.camY = y;
  state.camSubX = 0;
  state.camSubY = 0;
  state.selected = { x, y };
};

export const createBattleWarningBanner = (state: CameraState, store: BattleWarningStore, doc: Document | undefined = typeof document === "undefined" ? undefined : document): BattleWarningBanner => {
  let el: HTMLButtonElement | undefined;
  let shownText = "";
  let focus: { x: number; y: number } | undefined;
  const ensureEl = (): HTMLButtonElement | undefined => {
    if (el || !doc?.body) return el;
    el = doc.createElement("button");
    el.id = BATTLE_WARNING_BANNER_ID;
    el.type = "button";
    el.style.display = "none";
    el.setAttribute("aria-live", "assertive");
    el.addEventListener("click", () => {
      if (focus) jumpCameraToBattle(state, focus.x, focus.y);
      dismissBattleWarning(store);
    });
    doc.body.appendChild(el);
    return el;
  };
  return {
    sync: (view) => {
      if (!view) {
        focus = undefined;
        if (el && shownText !== "") {
          el.style.display = "none";
          shownText = "";
        }
        return;
      }
      const banner = ensureEl();
      if (!banner) return;
      focus = { x: view.focusX, y: view.focusY };
      const text = `${view.title} · ${view.detail}`;
      if (text === shownText) return;
      shownText = text;
      banner.textContent = text;
      banner.title = "Go to fight";
      banner.style.display = "block";
    }
  };
};
