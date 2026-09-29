import { EMPIRE_INTEGRITY_ENABLED } from "@border-empires/shared";
import { renderDefensibilityPanelHtml } from "../client-defensibility-html/client-defensibility-html.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

type DefensibilityPanelState = Pick<
  ClientState,
  "tiles" | "tilesRevision" | "me" | "defensibilityPct" | "settledT" | "settledE" | "showWeakDefensibility"
>;

type DefensibilityPanelDeps = {
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly terrainAt: (x: number, y: number) => Tile["terrain"];
  readonly safeValue: <T>(label: string, fallback: T, render: () => T) => T;
  readonly fallbackCard: (label: string) => string;
};

let cachedKey = "";
let cachedHtml = "";

/**
 * Renders the Empire Integrity panel, extracted from client-hud.ts and
 * memoized on the inputs that change it. The panel walks every settled tile's
 * neighbours through worldgen (1.3s for a large empire on a desktop, measured
 * by the login probe), and renderClientHud runs on every HUD refresh —
 * including the one inside the post-login INIT handler.
 */
export const renderDefensibilityPanels = (
  state: DefensibilityPanelState,
  dom: { readonly panelDefensibilityEl: HTMLElement; readonly mobilePanelDefensibilityEl: HTMLElement },
  deps: DefensibilityPanelDeps
): void => {
  const key = [state.tilesRevision, state.tiles.size, state.me, state.defensibilityPct, state.settledT, state.settledE, state.showWeakDefensibility].join("|");
  if (key !== cachedKey || !cachedHtml) {
    const html = deps.safeValue("renderDefensibilityPanelHtml", "", () =>
      renderDefensibilityPanelHtml({
        tiles: state.tiles,
        me: state.me,
        defensibilityPct: state.defensibilityPct,
        settledT: state.settledT,
        settledE: state.settledE,
        showWeakDefensibility: state.showWeakDefensibility,
        empireIntegrityEnabled: EMPIRE_INTEGRITY_ENABLED,
        keyFor: deps.keyFor,
        wrapX: deps.wrapX,
        wrapY: deps.wrapY,
        terrainAt: deps.terrainAt
      })
    );
    // A failed render is not cached, so the next refresh retries it.
    cachedKey = html ? key : "";
    cachedHtml = html;
  }
  const panelHtml = cachedHtml || deps.fallbackCard("Empire Integrity");
  dom.panelDefensibilityEl.innerHTML = panelHtml;
  dom.mobilePanelDefensibilityEl.innerHTML = panelHtml;
};

/** Test-only: forget the memoized panel. */
export const resetDefensibilityPanelCacheForTests = (): void => {
  cachedKey = "";
  cachedHtml = "";
};
