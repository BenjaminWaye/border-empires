// Binds the "show weak tiles" toggle buttons of the Empire Integrity panel.
// Extracted from client-hud.ts, which is over the file-line cap.
import { exposedSidesForTile, isOwnedSettledLandTile } from "../client-defensibility-tile.js";
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

export const bindWeakDefensibilityToggle = (root: ParentNode, state: ClientState, deps: WeakDefensibilityToggleDeps): void => {
  const weakDefButtons = root.querySelectorAll("[data-toggle-weak-def]") as NodeListOf<HTMLButtonElement>;
  weakDefButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      state.showWeakDefensibility = !state.showWeakDefensibility;
      const weakTileCount = [...state.tiles.values()].filter((tile) => {
        if (!isOwnedSettledLandTile(tile, state.me)) return false;
        return exposedSidesForTile(tile, {
          tiles: state.tiles,
          me: state.me,
          keyFor: deps.keyFor,
          wrapX: deps.wrapX,
          wrapY: deps.wrapY,
          terrainAt: deps.terrainAt
        }).length >= 2;
      }).length;
      deps.pushFeed(
        state.showWeakDefensibility
          ? `Showing weak tiles (${weakTileCount} highlighted).`
          : "Weak tiles hidden.",
        "info",
        "info"
      );
      deps.requestViewRefresh();
      deps.rerender();
    };
  });
};
