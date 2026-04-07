import {
  drawStartingExpansionArrow as drawStartingExpansionArrowFromModule,
  renderCaptureProgress as renderCaptureProgressFromModule,
  renderShardAlert as renderShardAlertFromModule
} from "./client-capture-effects.js";
import { renderClientHud } from "./client-hud.js";

type BootstrapRenderContext = Record<string, any>;

export const createClientBootstrapRender = (ctx: BootstrapRenderContext) => {
  const renderCaptureProgress = (): void =>
    renderCaptureProgressFromModule(ctx.state, {
      keyFor: ctx.keyFor,
      formatCooldownShort: ctx.actionFlow.formatCooldownShort,
      showCaptureAlert: ctx.showCaptureAlert,
      pushFeed: ctx.pushFeed,
      finalizePredictedCombat: (result: Record<string, unknown>) => ctx.actionFlow.applyCombatOutcomeMessage(result, { predicted: true }),
      captureCardEl: ctx.dom.captureCardEl,
      captureWrapEl: ctx.dom.captureWrapEl,
      captureCancelBtn: ctx.dom.captureCancelBtn,
      captureCloseBtn: ctx.dom.captureCloseBtn,
      captureBarEl: ctx.dom.captureBarEl,
      captureTitleEl: ctx.dom.captureTitleEl,
      captureTimeEl: ctx.dom.captureTimeEl,
      captureTargetEl: ctx.dom.captureTargetEl
    });

  const renderShardAlert = (): void =>
    renderShardAlertFromModule(ctx.state, {
      shardAlertOverlayEl: ctx.dom.shardAlertOverlayEl,
      shardAlertTitleEl: ctx.dom.shardAlertTitleEl,
      shardAlertDetailEl: ctx.dom.shardAlertDetailEl
    });

  const drawStartingExpansionArrow = (px: number, py: number, size: number, dx: number, dy: number): void =>
    drawStartingExpansionArrowFromModule(ctx.ctx, px, py, size, dx, dy);

  const renderHud = (): void => {
    try {
      renderClientHud({
        state: ctx.state,
        dom: ctx.hudDom,
        miniMapReplayEl: ctx.miniMapReplayEl,
        wsUrl: ctx.wsUrl,
        firebaseAuth: ctx.firebaseAuth,
        syncAuthOverlay: ctx.syncAuthOverlay,
        storageSet: ctx.storageSet,
        visibleCollectSummary: ctx.visibleCollectSummary,
        developmentSlotSummary: ctx.actionFlow.developmentSlotSummary,
        isMobile: ctx.isMobile,
        rateToneClass: ctx.rateToneClass,
        formatGoldAmount: ctx.formatGoldAmount,
        formatManpowerAmount: ctx.formatManpowerAmount,
        strategicRibbonHtml: ctx.strategicRibbonHtml,
        formatCooldownShort: ctx.actionFlow.formatCooldownShort,
        openEconomyPanel: ctx.openEconomyPanel,
        setActivePanel: ctx.setActivePanel,
        affordableTechChoicesCount: ctx.techFlow.affordableTechChoicesCount,
        mobileNavLabelHtml: ctx.mobileNavLabelHtml,
        crystalTargetingTone: ctx.actionFlow.crystalTargetingTone,
        crystalTargetingTitle: ctx.actionFlow.crystalTargetingTitle,
        clearCrystalTargeting: ctx.actionFlow.clearCrystalTargeting,
        keyFor: ctx.keyFor,
        parseKey: ctx.parseKey,
        selectedTile: ctx.selectedTile,
        requestTileDetailIfNeeded: ctx.actionFlow.requestTileDetailIfNeeded,
        passiveTileGuidanceHtml: ctx.passiveTileGuidanceHtml,
        renderTileActionMenu: ctx.actionFlow.renderTileActionMenu,
        tileMenuViewForTile: ctx.actionFlow.tileMenuViewForTile,
        renderCaptureProgress,
        renderShardAlert,
        renderTechChoiceGrid: ctx.techFlow.renderTechChoiceGrid,
        techDetailsUseOverlay: ctx.techFlow.techDetailsUseOverlay,
        renderTechDetailPrompt: ctx.techFlow.renderTechDetailPrompt,
        renderTechDetailCard: ctx.techFlow.renderTechDetailCard,
        renderStructureInfoOverlay: ctx.techFlow.renderStructureInfoOverlay,
        renderTechDetailOverlay: ctx.techFlow.renderTechDetailOverlay,
        renderDomainDetailOverlay: ctx.techFlow.renderDomainDetailOverlay,
        techOwnedHtml: ctx.techOwnedHtml,
        effectiveOwnedTechIds: ctx.techFlow.effectiveOwnedTechIds,
        isPendingTechUnlock: ctx.techFlow.isPendingTechUnlock,
        renderTechChoiceDetails: ctx.techFlow.renderTechChoiceDetails,
        techCurrentModsHtml: ctx.techCurrentModsHtml,
        bindTechTreeDragScroll: ctx.bindTechTreeDragScroll,
        chooseTech: ctx.actionFlow.chooseTech,
        renderDomainProgressCard: ctx.techFlow.renderDomainProgressCard,
        renderDomainChoiceGrid: ctx.techFlow.renderDomainChoiceGrid,
        domainOwnedHtml: ctx.domainOwnedHtml,
        renderDomainDetailCard: ctx.techFlow.renderDomainDetailCard,
        sendGameMessage: ctx.actionFlow.sendGameMessage,
        alliesHtml: ctx.alliesHtml,
        activeTrucesHtml: ctx.activeTrucesHtml,
        allianceRequestsHtml: ctx.allianceRequestsHtml,
        truceRequestsHtml: ctx.truceRequestsHtml,
        renderSocialInspectCardHtml: ctx.renderSocialInspectCardHtml,
        missionCardsHtml: ctx.missionCardsHtml,
        playerNameForOwner: ctx.playerNameForOwner,
        wrapX: ctx.wrapX,
        wrapY: ctx.wrapY,
        terrainAt: ctx.terrainAt,
        pushFeed: ctx.pushFeed,
        requestViewRefresh: ctx.requestViewRefresh,
        prettyToken: ctx.prettyToken,
        resourceIconForKey: ctx.resourceIconForKey,
        resourceLabel: ctx.resourceLabel,
        economicStructureName: ctx.economicStructureName,
        leaderboardHtml: ctx.leaderboardHtml,
        feedHtml: ctx.feedHtml,
        renderMobilePanels: ctx.renderMobilePanels,
        effectiveTechChoices: ctx.techFlow.effectiveTechChoices,
        renderManpowerPanelHtml: ctx.renderManpowerPanelHtml
      });
    } catch (error) {
      console.error("[hud-render-fatal]", error);
      ctx.setAuthStatus("The interface hit an unexpected error. Retrying UI render...", "error");
      ctx.syncAuthOverlay();
    }
  };

  return { renderCaptureProgress, renderShardAlert, drawStartingExpansionArrow, renderHud };
};
