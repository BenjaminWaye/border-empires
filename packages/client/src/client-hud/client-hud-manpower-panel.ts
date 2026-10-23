import type { ClientState } from "../client-state/client-state.js";
import type { renderManpowerPanelHtml } from "../client-side-panel-html/client-side-panel-html.js";
import { buildManpowerPanelMusterFlags, wireManpowerPanel } from "../client-muster-flags-panel/client-muster-flags-panel.js";
import { nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";
import { bindShardMobilizeButtons } from "../client-shard-mobilize/client-shard-mobilize.js";

export type HudManpowerPanelDeps = {
  state: ClientState;
  dom: { hud: HTMLElement; panelManpowerEl: HTMLElement; mobilePanelManpowerEl: HTMLElement };
  renderManpowerPanelHtml: typeof renderManpowerPanelHtml;
  formatManpowerAmount: (value: number) => string;
  rateToneClass: (rate: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  requestViewRefresh: () => void;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  rerender: () => void;
  /** The HUD's error-isolating wrapper, so a throwing panel falls back instead of blanking the HUD. */
  safeHtml: (label: string, fallback: string, render: () => string) => string;
  fallbackHtml: string;
};

/** Renders and wires the manpower detail panel (desktop and mobile copies), extracted from client-hud.ts. */
export const renderHudManpowerPanel = (deps: HudManpowerPanelDeps): void => {
  const { state, dom } = deps;
  const html = deps.safeHtml("renderManpowerPanelHtml", deps.fallbackHtml, () =>
    deps.renderManpowerPanelHtml({
      manpower: state.manpower,
      manpowerCap: state.manpowerCap,
      manpowerRegenPerMinute: state.manpowerRegenPerMinute,
      manpowerBreakdown: state.manpowerBreakdown,
      musterFlags: buildManpowerPanelMusterFlags(state.tiles.values(), state.me, state.manpowerCap, state.manpower, state.musterAmountRateByTile),
      formatManpowerAmount: deps.formatManpowerAmount,
      rateToneClass: deps.rateToneClass,
      nextRefillAtMs: nextManpowerRefillForPlayer(state.me, Date.now()),
      shards: state.strategicResources.SHARD ?? 0
    })
  );
  dom.panelManpowerEl.innerHTML = dom.mobilePanelManpowerEl.innerHTML = html;
  wireManpowerPanel(dom.hud, state, { wrapX: deps.wrapX, wrapY: deps.wrapY, requestViewRefresh: deps.requestViewRefresh, rerender: deps.rerender });
  bindShardMobilizeButtons(dom.panelManpowerEl, deps.sendGameMessage);
  bindShardMobilizeButtons(dom.mobilePanelManpowerEl, deps.sendGameMessage);
};
