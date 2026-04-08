import {
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  LIGHT_OUTPOST_ATTACK_MULT,
  LIGHT_OUTPOST_BUILD_MS,
  SETTLE_COST,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_MS,
  WOODEN_FORT_BUILD_MS,
  WOODEN_FORT_DEFENSE_MULT,
  structureShowsOnTile,
  type ResourceType
} from "@border-empires/shared";
import { canAffordCost, isForestTile, settleDurationMsForTile } from "./client-constants.js";
import { hasQueuedSettlementForTile } from "./client-development-queue.js";
import { closeActivePanel } from "./client-panel-nav.js";
import type { ClientState } from "./client-state.js";

type HoldBuildMenuDeps = Record<string, any> & {
  state: ClientState;
  holdBuildMenuEl: HTMLDivElement;
};

type UiControlsDeps = Record<string, any> & {
  state: ClientState;
  hud: HTMLElement;
  allianceSendBtn: HTMLButtonElement;
  mobileAllianceSendBtn: HTMLButtonElement;
  allianceBreakBtn: HTMLButtonElement;
  mobileAllianceBreakBtn: HTMLButtonElement;
  allianceTargetEl: HTMLInputElement;
  mobileAllianceTargetEl: HTMLInputElement;
  allianceBreakIdEl: HTMLInputElement;
  mobileAllianceBreakIdEl: HTMLInputElement;
  techChooseBtn: HTMLButtonElement;
  mobileTechChooseBtn: HTMLButtonElement;
  techPickEl: HTMLSelectElement;
  mobileTechPickEl: HTMLSelectElement;
  centerMeBtn: HTMLButtonElement;
  centerMeDesktopBtn: HTMLButtonElement;
  collectVisibleDesktopBtn: HTMLButtonElement;
  collectVisibleMobileBtn: HTMLButtonElement;
  captureCancelBtn: HTMLButtonElement;
  captureCloseBtn: HTMLButtonElement;
  captureTimeEl: HTMLElement;
  shardAlertCloseBtn: HTMLButtonElement;
  panelCloseBtn: HTMLButtonElement;
  panelActionButtons: NodeListOf<HTMLButtonElement> | HTMLButtonElement[];
  authColorPresetButtons: NodeListOf<HTMLButtonElement> | HTMLButtonElement[];
  authProfileColorEl: HTMLInputElement;
  authEmailEl: HTMLInputElement;
  authEmailLinkBtn: HTMLButtonElement;
  authProfileNameEl: HTMLInputElement;
  authProfileSaveBtn: HTMLButtonElement;
};

export const showClientHoldBuildMenu = (deps: HoldBuildMenuDeps, x: number, y: number, clientX: number, clientY: number): void => {
  const {
    state,
    holdBuildMenuEl,
    keyFor,
    hideHoldBuildMenu,
    developmentSlotSummary,
    structureGoldCost,
    isOwnedBorderTile,
    structureCostText,
    viewportSize,
    requestSettlement,
    sendDevelopmentBuild,
    applyOptimisticStructureBuild,
    renderHud
  } = deps;

  const tile = state.tiles.get(keyFor(x, y));
  if (!tile || tile.ownerId !== state.me || tile.terrain !== "LAND") {
    hideHoldBuildMenu();
    return;
  }
  state.selected = { x, y };
  const development = developmentSlotSummary();
  const hasDevelopmentSlot = development.available > 0;
  const queueableWhenBusy = !hasDevelopmentSlot;
  const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
  const canUpgradeWoodenFort = tile.economicStructure?.type === "WOODEN_FORT" && state.techIds.includes("masonry");
  const canUpgradeLightOutpost = tile.economicStructure?.type === "LIGHT_OUTPOST" && state.techIds.includes("leatherworking");
  const fortGoldCost = structureGoldCost("FORT");
  const siegeGoldCost = structureGoldCost("SIEGE_OUTPOST");
  const woodenFortGoldCost = structureGoldCost("WOODEN_FORT");
  const lightOutpostGoldCost = structureGoldCost("LIGHT_OUTPOST");
  const observatoryGoldCost = structureGoldCost("OBSERVATORY");
  const isBorderOrDock = Boolean(tile.dockId || isOwnedBorderTile(x, y));
  const settledShowInput = {
    ownershipState: tile.ownershipState,
    resource: tile.resource as ResourceType | undefined,
    dockId: tile.dockId,
    townPopulationTier: tile.town?.populationTier
  };
  const canBuildStarterWoodenFort =
    tile.ownerId === state.me &&
    tile.ownershipState === "SETTLED" &&
    structureShowsOnTile("WOODEN_FORT", settledShowInput) &&
    isBorderOrDock &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    state.gold >= woodenFortGoldCost;
  const canBuildAdvancedFort =
    tile.ownerId === state.me &&
    tile.ownershipState === "SETTLED" &&
    isBorderOrDock &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    (!tile.economicStructure || canUpgradeWoodenFort) &&
    state.techIds.includes("masonry") &&
    state.gold >= fortGoldCost &&
    (state.strategicResources.IRON ?? 0) >= 45;
  const canBuildStarterLightOutpost =
    tile.ownerId === state.me &&
    tile.ownershipState === "SETTLED" &&
    structureShowsOnTile("LIGHT_OUTPOST", settledShowInput) &&
    isBorderOrDock &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    state.gold >= lightOutpostGoldCost;
  const canBuildAdvancedSiegeOutpost =
    tile.ownerId === state.me &&
    tile.ownershipState === "SETTLED" &&
    structureShowsOnTile("SIEGE_OUTPOST", settledShowInput) &&
    isBorderOrDock &&
    !tile.siegeOutpost &&
    !tile.fort &&
    !tile.observatory &&
    (!tile.economicStructure || canUpgradeLightOutpost) &&
    state.techIds.includes("leatherworking") &&
    state.gold >= siegeGoldCost &&
    (state.strategicResources.SUPPLY ?? 0) >= 45;
  const canAffordFort = canBuildStarterWoodenFort || canBuildAdvancedFort;
  const canAffordSiege = canBuildStarterLightOutpost || canBuildAdvancedSiegeOutpost;
  const canAffordObservatory =
    tile.ownershipState === "SETTLED" &&
    structureShowsOnTile("OBSERVATORY", settledShowInput) &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    state.techIds.includes("cartography") &&
    state.gold >= observatoryGoldCost &&
    (state.strategicResources.CRYSTAL ?? 0) >= 45;
  const canBuildFarmstead =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "FARM" || tile.resource === "FISH") &&
    state.techIds.includes("agriculture") &&
    state.gold >= 700 &&
    (state.strategicResources.FOOD ?? 0) >= 20;
  const canBuildCamp =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "WOOD" || tile.resource === "FUR") &&
    state.techIds.includes("leatherworking") &&
    state.gold >= 800 &&
    (state.strategicResources.SUPPLY ?? 0) >= 30;
  const canBuildMine =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "IRON" || tile.resource === "GEMS") &&
    state.techIds.includes("mining") &&
    state.gold >= 800 &&
    (state.strategicResources[tile.resource === "IRON" ? "IRON" : "CRYSTAL"] ?? 0) >= 30;
  const canBuildMarket =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    tile.town?.populationTier !== "SETTLEMENT" &&
    state.techIds.includes("trade") &&
    state.gold >= 1200 &&
    (state.strategicResources.CRYSTAL ?? 0) >= 40;
  const canBuildGranary =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    tile.town?.populationTier !== "SETTLEMENT" &&
    state.techIds.includes("pottery") &&
    state.gold >= 700 &&
    (state.strategicResources.FOOD ?? 0) >= 40;
  const settlementQueued = hasQueuedSettlementForTile(state.developmentQueue, keyFor(x, y));
  holdBuildMenuEl.innerHTML = `
    <div class="hold-menu-card">
      <div class="hold-menu-title">Build on (${x}, ${y})</div>
      <button class="hold-menu-btn" data-build="settle" ${tile.ownershipState === "FRONTIER" && canAffordCost(state.gold, SETTLE_COST) && !settlementQueued ? "" : "disabled"}>
        <span>Settle Tile</span>
        <small>${SETTLE_COST} gold • ${(settleDurationMsForTile(x, y) / 1000).toFixed(0)}s${isForestTile(x, y) ? " (Forest)" : ""} • converts frontier to settled${settlementQueued ? " • already queued" : queueableWhenBusy && tile.ownershipState === "FRONTIER" ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="fort" ${canAffordFort ? "" : "disabled"}>
        <span>${canUpgradeWoodenFort ? "Upgrade to Fort" : state.techIds.includes("masonry") ? "Fort" : "Wooden Fort"}</span>
        <small>${state.techIds.includes("masonry") ? `${structureCostText("FORT")} • ${(FORT_BUILD_MS / 1000).toFixed(0)}s • def x${FORT_DEFENSE_MULT.toFixed(2)}` : `${structureCostText("WOODEN_FORT")} • ${(WOODEN_FORT_BUILD_MS / 1000).toFixed(0)}s • def x${WOODEN_FORT_DEFENSE_MULT.toFixed(2)}`} • 1 gold / min${queueableWhenBusy ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="observatory" ${canAffordObservatory ? "" : "disabled"}>
        <span>Observatory</span>
        <small>${structureCostText("OBSERVATORY")} • +5 local vision • 0.025 crystal / min${queueableWhenBusy && canAffordObservatory ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="farmstead" ${canBuildFarmstead ? "" : "disabled"}>
        <span>Farmstead</span>
        <small>700 gold + 20 FOOD • +50% food output • 1 gold / 10m${queueableWhenBusy && canBuildFarmstead ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="camp" ${canBuildCamp ? "" : "disabled"}>
        <span>Camp</span>
        <small>800 gold + 30 SUPPLY • +50% supply output • 1.2 gold / 10m${queueableWhenBusy && canBuildCamp ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="mine" ${canBuildMine ? "" : "disabled"}>
        <span>Mine</span>
        <small>800 gold + 30 matching resource • +50% iron or crystal • 1.2 gold / 10m${queueableWhenBusy && canBuildMine ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="market" ${canBuildMarket ? "" : "disabled"}>
        <span>Market</span>
        <small>1200 gold + 40 CRYSTAL • +50% fed town gold • +50% town cap • 0.05 crystal / min${queueableWhenBusy && canBuildMarket ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="granary" ${canBuildGranary ? "" : "disabled"}>
        <span>Granary</span>
        <small>700 gold + 40 FOOD • +50% town gold cap • 1 gold / 10m${queueableWhenBusy && canBuildGranary ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="siege" ${canAffordSiege ? "" : "disabled"}>
        <span>${canUpgradeLightOutpost ? "Upgrade to Siege Outpost" : state.techIds.includes("leatherworking") ? "Siege Outpost" : "Light Outpost"}</span>
        <small>${state.techIds.includes("leatherworking") ? `${structureCostText("SIEGE_OUTPOST")} • ${(SIEGE_OUTPOST_BUILD_MS / 1000).toFixed(0)}s • atk x${SIEGE_OUTPOST_ATTACK_MULT.toFixed(2)}` : `${structureCostText("LIGHT_OUTPOST")} • ${(LIGHT_OUTPOST_BUILD_MS / 1000).toFixed(0)}s • atk x${LIGHT_OUTPOST_ATTACK_MULT.toFixed(2)}`} • 1 gold / min${queueableWhenBusy ? " • queues" : ""}</small>
      </button>
    </div>
  `;
  const { width: vw, height: vh } = viewportSize();
  const menuW = Math.min(290, vw - 16);
  const menuH = 168;
  const left = Math.max(8, Math.min(vw - menuW - 8, clientX + 8));
  const top = Math.max(84, Math.min(vh - menuH - 8, clientY + 8));
  holdBuildMenuEl.style.width = `${menuW}px`;
  holdBuildMenuEl.style.left = `${left}px`;
  holdBuildMenuEl.style.top = `${top}px`;
  holdBuildMenuEl.style.display = "block";

  const settleBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='settle']");
  const fortBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='fort']");
  const observatoryBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='observatory']");
  const farmsteadBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='farmstead']");
  const campBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='camp']");
  const mineBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='mine']");
  const marketBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='market']");
  const granaryBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='granary']");
  const siegeBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='siege']");
  if (settleBtn) {
    settleBtn.onclick = () => {
      requestSettlement(x, y);
      hideHoldBuildMenu();
    };
  }
  if (fortBtn) {
    fortBtn.onclick = () => {
      if (canBuildAdvancedFort) {
        sendDevelopmentBuild({ type: "BUILD_FORT", x, y }, () => applyOptimisticStructureBuild(x, y, "FORT"), {
          x,
          y,
          label: `${canUpgradeWoodenFort ? "Fort upgrade" : "Fort"} at (${x}, ${y})`,
          optimisticKind: "FORT"
        });
      } else if (canBuildStarterWoodenFort) {
        sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "WOODEN_FORT" }, () => applyOptimisticStructureBuild(x, y, "WOODEN_FORT"), {
          x,
          y,
          label: `Wooden Fort at (${x}, ${y})`,
          optimisticKind: "WOODEN_FORT"
        });
      }
      hideHoldBuildMenu();
    };
  }
  if (siegeBtn) {
    siegeBtn.onclick = () => {
      if (canBuildAdvancedSiegeOutpost) {
        sendDevelopmentBuild({ type: "BUILD_SIEGE_OUTPOST", x, y }, () => applyOptimisticStructureBuild(x, y, "SIEGE_OUTPOST"), {
          x,
          y,
          label: `${canUpgradeLightOutpost ? "Siege outpost upgrade" : "Siege outpost"} at (${x}, ${y})`,
          optimisticKind: "SIEGE_OUTPOST"
        });
      } else if (canBuildStarterLightOutpost) {
        sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "LIGHT_OUTPOST" }, () => applyOptimisticStructureBuild(x, y, "LIGHT_OUTPOST"), {
          x,
          y,
          label: `Light Outpost at (${x}, ${y})`,
          optimisticKind: "LIGHT_OUTPOST"
        });
      }
      hideHoldBuildMenu();
    };
  }
  if (observatoryBtn) {
    observatoryBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_OBSERVATORY", x, y }, () => applyOptimisticStructureBuild(x, y, "OBSERVATORY"), {
        x,
        y,
        label: `Observatory at (${x}, ${y})`,
        optimisticKind: "OBSERVATORY"
      });
      hideHoldBuildMenu();
    };
  }
  if (farmsteadBtn) {
    farmsteadBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "FARMSTEAD" }, () => applyOptimisticStructureBuild(x, y, "FARMSTEAD"), {
        x,
        y,
        label: `Farmstead at (${x}, ${y})`,
        optimisticKind: "FARMSTEAD"
      });
      hideHoldBuildMenu();
    };
  }
  if (campBtn) {
    campBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "CAMP" }, () => applyOptimisticStructureBuild(x, y, "CAMP"), {
        x,
        y,
        label: `Camp at (${x}, ${y})`,
        optimisticKind: "CAMP"
      });
      hideHoldBuildMenu();
    };
  }
  if (mineBtn) {
    mineBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MINE" }, () => applyOptimisticStructureBuild(x, y, "MINE"), {
        x,
        y,
        label: `Mine at (${x}, ${y})`,
        optimisticKind: "MINE"
      });
      hideHoldBuildMenu();
    };
  }
  if (marketBtn) {
    marketBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MARKET" }, () => applyOptimisticStructureBuild(x, y, "MARKET"), {
        x,
        y,
        label: `Market at (${x}, ${y})`,
        optimisticKind: "MARKET"
      });
      hideHoldBuildMenu();
    };
  }
  if (granaryBtn) {
    granaryBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "GRANARY" }, () => applyOptimisticStructureBuild(x, y, "GRANARY"), {
        x,
        y,
        label: `Granary at (${x}, ${y})`,
        optimisticKind: "GRANARY"
      });
      hideHoldBuildMenu();
    };
  }
  renderHud();
};

export const bindClientUiControls = (deps: UiControlsDeps): void => {
  const {
    state,
    hud,
    allianceSendBtn,
    mobileAllianceSendBtn,
    allianceBreakBtn,
    mobileAllianceBreakBtn,
    allianceTargetEl,
    mobileAllianceTargetEl,
    allianceBreakIdEl,
    mobileAllianceBreakIdEl,
    techChooseBtn,
    mobileTechChooseBtn,
    techPickEl,
    mobileTechPickEl,
    centerMeBtn,
    centerMeDesktopBtn,
    collectVisibleDesktopBtn,
    collectVisibleMobileBtn,
    captureCancelBtn,
    captureCloseBtn,
    captureTimeEl,
    shardAlertCloseBtn,
    panelCloseBtn,
    panelActionButtons,
    authColorPresetButtons,
    authProfileColorEl,
    authEmailEl,
    authEmailLinkBtn,
    authProfileNameEl,
    authProfileSaveBtn,
    sendAllianceRequest,
    breakAlliance,
    chooseTech,
    renderHud,
    centerOnOwnedTile,
    requestViewRefresh,
    collectVisibleYield,
    cancelOngoingCapture,
    hideShardAlert,
    renderShardAlert,
    renderCaptureProgress,
    setActivePanel,
    syncAuthPanelState
  } = deps;

  allianceSendBtn.onclick = () => {
    sendAllianceRequest(allianceTargetEl.value);
  };
  mobileAllianceSendBtn.onclick = () => {
    sendAllianceRequest(mobileAllianceTargetEl.value);
  };
  allianceBreakBtn.onclick = () => {
    breakAlliance(allianceBreakIdEl.value);
  };
  mobileAllianceBreakBtn.onclick = () => {
    breakAlliance(mobileAllianceBreakIdEl.value);
  };
  techChooseBtn.onclick = () => {
    chooseTech();
  };
  mobileTechChooseBtn.onclick = () => {
    chooseTech();
  };
  techPickEl.onchange = () => {
    state.techUiSelectedId = techPickEl.value;
    mobileTechPickEl.value = techPickEl.value;
    renderHud();
  };
  mobileTechPickEl.onchange = () => {
    state.techUiSelectedId = mobileTechPickEl.value;
    techPickEl.value = mobileTechPickEl.value;
    renderHud();
  };
  centerMeBtn.onclick = () => {
    centerOnOwnedTile();
    requestViewRefresh(2, true);
  };
  centerMeDesktopBtn.onclick = () => {
    centerOnOwnedTile();
    requestViewRefresh(2, true);
  };
  collectVisibleDesktopBtn.onclick = () => {
    collectVisibleYield();
  };
  collectVisibleMobileBtn.onclick = () => {
    collectVisibleYield();
  };
  captureCancelBtn.onclick = () => cancelOngoingCapture();
  captureCloseBtn.onclick = () => {
    state.captureAlert = undefined;
    captureTimeEl.classList.remove("capture-loss");
    renderCaptureProgress();
  };
  shardAlertCloseBtn.onclick = () => {
    hideShardAlert();
    renderShardAlert();
  };
  panelCloseBtn.onclick = () => {
    closeActivePanel(state);
    renderHud();
  };

  panelActionButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const panel = btn.dataset.panel as typeof state.activePanel;
      if (!panel) return;
      setActivePanel(panel);
    };
  });

  authColorPresetButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const color = btn.dataset.color;
      if (!color) return;
      authProfileColorEl.value = color;
      syncAuthPanelState();
    };
  });

  authProfileColorEl.oninput = () => {
    syncAuthPanelState();
  };

  authEmailEl.onkeydown = (event) => {
    if (event.key === "Enter" && !state.profileSetupRequired) {
      event.preventDefault();
      authEmailLinkBtn.click();
    }
  };

  authProfileNameEl.onkeydown = (event) => {
    if (event.key === "Enter" && state.profileSetupRequired) {
      event.preventDefault();
      authProfileSaveBtn.click();
    }
  };

  const mobileNavButtons = hud.querySelectorAll<HTMLButtonElement>("#mobile-nav button[data-mobile-panel]");
  mobileNavButtons.forEach((btn) => {
    btn.onclick = () => {
      const panel = btn.dataset.mobilePanel as typeof state.mobilePanel | undefined;
      if (!panel) return;
      state.mobilePanel = panel;
      if (panel === "feed") state.unreadAttackAlerts = 0;
      renderHud();
    };
  });
};
