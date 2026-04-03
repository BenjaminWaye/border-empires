import type { TileActionDef, TileMenuTab, TileMenuView } from "./client-types.js";

const actionIcon = (id: TileActionDef["id"]): string => {
  if (id === "settle_land") return "⌂";
  if (id === "launch_attack") return "⚔";
  if (id === "launch_breach_attack") return "✦";
  if (id === "reveal_empire") return "◈";
  if (id === "collect_yield") return "⛃";
  if (id === "collect_shard") return "✦";
  if (id === "build_fortification") return "🛡";
  if (id === "build_wooden_fort") return "🪵";
  if (id === "build_siege_camp") return "⚔";
  if (id === "build_light_outpost") return "⚑";
  if (id === "build_observatory") return "◉";
  if (id === "build_farmstead") return "▥";
  if (id === "build_camp") return "⛺";
  if (id === "build_mine") return "⛏";
  if (id === "build_market") return "▣";
  if (id === "build_granary") return "◫";
  if (id === "build_bank") return "◧";
  if (id === "build_airport") return "✈";
  if (id === "build_caravanary") return "⇄";
  if (id === "build_quartermaster") return "▤";
  if (id === "upgrade_quartermaster") return "⤴";
  if (id === "build_ironworks") return "⚒";
  if (id === "upgrade_ironworks") return "⤴";
  if (id === "build_crystal_synthesizer") return "◇";
  if (id === "upgrade_crystal_synthesizer") return "⤴";
  if (id === "overload_quartermaster") return "↯";
  if (id === "overload_ironworks") return "↯";
  if (id === "overload_crystal_synthesizer") return "↯";
  if (id === "build_fuel_plant") return "⬢";
  if (id === "build_foundry") return "⚙";
  if (id === "build_garrison_hall") return "🛡";
  if (id === "build_customs_house") return "⚓";
  if (id === "build_radar_system") return "◌";
  if (id === "build_governors_office") return "⌘";
  if (id === "remove_structure") return "⌫";
  if (id === "abandon_territory") return "✕";
  if (id === "aether_bridge") return "≈";
  if (id === "siphon_tile") return "☍";
  if (id === "purge_siphon") return "◌";
  if (id === "create_mountain") return "⛰";
  if (id === "remove_mountain") return "⌵";
  return "⛺";
};

const tileMenuTabLabel = (tab: TileMenuTab): string => {
  if (tab === "overview") return "Overview";
  if (tab === "actions") return "Actions";
  if (tab === "buildings") return "Buildings";
  if (tab === "crystal") return "Crystal";
  return "Progress";
};

const tileMenuBodyHtml = (view: TileMenuView, activeTab: TileMenuTab): string => {
  const actionsForTab =
    activeTab === "actions" ? view.actions : activeTab === "buildings" ? view.buildings : activeTab === "crystal" ? view.crystal : undefined;
  if (actionsForTab) {
    if (actionsForTab.length === 0) {
      const label = activeTab === "buildings" ? "buildings" : activeTab === "crystal" ? "crystal actions" : "actions";
      return `<div class="tile-menu-empty">No ${label} available on this tile right now.</div>`;
    }
    return `<div class="tile-action-list">${actionsForTab
      .map(
        (action: TileActionDef) => `<button class="tile-action-btn" data-action="${action.id}" ${action.targetKey ? `data-target-key="${action.targetKey}"` : ""} ${action.originKey ? `data-origin-key="${action.originKey}"` : ""} ${action.disabled ? "disabled" : ""}>
          <span class="tile-action-icon">${actionIcon(action.id)}</span>
          <span class="tile-action-copy">
            <span class="tile-action-label">${action.label}</span>
            ${action.detail || action.disabledReason ? `<span class="tile-action-detail">${action.detail ?? action.disabledReason ?? ""}</span>` : ""}
          </span>
          ${action.cost ? `<span class="tile-action-cost">${action.cost}</span>` : ""}
        </button>`
      )
      .join("")}</div>`;
  }
  if (activeTab === "progress") {
    if (!view.progress) return `<div class="tile-menu-empty">Nothing is currently in progress on this tile.</div>`;
    return `
      <div class="tile-progress-card">
        <div class="tile-progress-title">${view.progress.title}</div>
        <div class="tile-progress-detail">${view.progress.detail}</div>
        <div class="tile-progress-meta">
          <span>Remaining</span>
          <strong>${view.progress.remainingLabel}</strong>
        </div>
        <div class="tile-progress-bar"><div style="width:${Math.round(view.progress.progress * 100)}%"></div></div>
        <div class="tile-progress-note">${view.progress.note}</div>
        ${view.progress.cancelLabel ? `<button class="tile-progress-cancel" type="button" data-progress-action="${view.progress.cancelActionId ?? "cancel_structure_build"}">${view.progress.cancelLabel}</button>` : ""}
      </div>
    `;
  }
  return `
    <div class="tile-overview-card">
      ${view.overviewKicker ? `<div class="tile-overview-kicker">${view.overviewKicker}</div>` : ""}
      ${view.overviewLines.map((line) => `<div class="tile-overview-line${line.kind === "effect" ? " tile-overview-line-effect" : ""}">${line.html}</div>`).join("")}
    </div>
  `;
};

export const tileActionMenuHtml = (view: TileMenuView, activeTab: TileMenuTab, mobile: boolean): string => {
  const tabsHtml =
    view.tabs.length > 1
      ? `<div class="tile-menu-tabs">${view.tabs
          .map((tab) => `<button class="tile-menu-tab${tab === activeTab ? " is-active" : ""}" type="button" data-tile-tab="${tab}">${tileMenuTabLabel(tab)}</button>`)
          .join("")}</div>`
      : "";
  return `
    <div class="tile-action-card">
      <button class="tile-action-close" id="tile-action-close" title="Close">×</button>
      <div class="tile-action-head">
        <div class="tile-action-title">${view.title}</div>
        <div class="tile-action-subtitle">${view.subtitle}</div>
      </div>
      ${tabsHtml}
      <div class="tile-menu-body" data-tile-menu-scroll>${tileMenuBodyHtml(view, activeTab)}</div>
      <div class="tile-action-hint">${mobile ? "Tap outside to close" : "Right-click or ESC to close"}</div>
    </div>
  `;
};
