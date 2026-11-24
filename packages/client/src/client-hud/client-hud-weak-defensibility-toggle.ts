// Binds the "show weak tiles" toggle buttons of the Empire Integrity panel.
// Extracted from client-hud.ts, which is over the file-line cap.
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { focusCameraOnTile } from "../client-activity-dashboard/client-activity-dashboard-center.js";
import { weakDefensibilityEntries } from "../client-defensibility-weak-tiles/client-defensibility-weak-tiles.js";
import type { ClientState } from "../client-state/client-state.js";
import type { FeedSeverity, FeedType, Tile } from "../client-types.js";

export type WeakDefensibilityToggleDeps = {
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly terrainAt: (x: number, y: number) => Tile["terrain"];
  readonly pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
  readonly requestViewRefresh: () => void;
  readonly rerender: () => void;
};

type WeakToggleState = Pick<ClientState, "tiles" | "me" | "showWeakDefensibility" | "camX" | "camY" | "camSubX" | "camSubY" | "selected">;

/**
 * Toggles the weak-tile highlight. Turning it on also pans the camera to the
 * weakest weak tile (nearest the camera among equally weak ones) and says why
 * it is weak, instead of leaving the player hunting for the highlights. The
 * camera move is renderer-agnostic: both the 2D canvas and true-3D renderer
 * read camX/camY/selected from shared state.
 */
export const toggleWeakDefensibility = (state: WeakToggleState, deps: WeakDefensibilityToggleDeps): void => {
  state.showWeakDefensibility = !state.showWeakDefensibility;
  if (!state.showWeakDefensibility) {
    deps.pushFeed("Weak tiles hidden.", "info", "info");
  } else {
    const entries = weakDefensibilityEntries({
      tiles: state.tiles,
      me: state.me,
      keyFor: deps.keyFor,
      wrapX: deps.wrapX,
      wrapY: deps.wrapY,
      terrainAt: deps.terrainAt,
      from: { x: state.camX, y: state.camY },
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT
    });
    const first = entries[0];
    if (!first) {
      deps.pushFeed("No weak tiles: none of your land has more than 1 open side.", "info", "info");
    } else {
      focusCameraOnTile(state, first.x, first.y, deps);
      deps.pushFeed(`Showing ${entries.length} weak tile${entries.length === 1 ? "" : "s"}. Weakest at (${first.x}, ${first.y}): ${first.reason}.`, "info", "info");
    }
  }
  deps.requestViewRefresh();
  deps.rerender();
};

/** Wires the panel's toggle button and its per-tile "go to" buttons. */
export const bindWeakDefensibilityToggle = (root: ParentNode, state: ClientState, deps: WeakDefensibilityToggleDeps): void => {
  root.querySelectorAll<HTMLButtonElement>("[data-toggle-weak-def]").forEach((btn) => {
    btn.onclick = () => toggleWeakDefensibility(state, deps);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-weak-def-focus]").forEach((btn) => {
    btn.onclick = () => {
      const [x, y] = (btn.dataset.weakDefFocus ?? "").split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      focusCameraOnTile(state, x as number, y as number, deps);
    };
  });
};
