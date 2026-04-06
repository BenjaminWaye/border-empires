import { FRONTIER_CLAIM_COST } from "@border-empires/shared";
import { canAffordCost } from "./client-constants.js";
import { neutralTileClickOutcome } from "./client-tile-interaction.js";
import { showClientHoldBuildMenu } from "./client-ui-controls.js";
import type { ClientState } from "./client-state.js";

type ActionFlowDispatchContext = Record<string, any> & {
  state: ClientState;
};

export const createClientActionFlowDispatch = (ctx: ActionFlowDispatchContext) => {
  const { state } = ctx;

  const shouldResetFrontierActionStateForError = (errorCode: string): boolean => {
    if (!errorCode) return true;
    switch (errorCode) {
      case "SETTLE_INVALID":
      case "FORT_BUILD_INVALID":
      case "OBSERVATORY_BUILD_INVALID":
      case "SIEGE_OUTPOST_BUILD_INVALID":
      case "ECONOMIC_STRUCTURE_BUILD_INVALID":
      case "STRUCTURE_CANCEL_INVALID":
      case "TOWN_UNFED":
        return false;
      default:
        return true;
    }
  };

  const buildFortOnSelected = (): void => ctx.buildFortOnSelectedFromModule(state, { pushFeed: ctx.pushFeed, renderHud: ctx.renderHud, sendGameMessage: ctx.sendGameMessage });
  const settleSelected = (): void => ctx.settleSelectedFromModule(state, { keyFor: ctx.keyFor, pushFeed: ctx.pushFeed, renderHud: ctx.renderHud, requestSettlement: ctx.requestSettlement });
  const buildSiegeOutpostOnSelected = (): void => ctx.buildSiegeOutpostOnSelectedFromModule(state, { pushFeed: ctx.pushFeed, renderHud: ctx.renderHud, sendGameMessage: ctx.sendGameMessage });
  const uncaptureSelected = (): void => ctx.uncaptureSelectedFromModule(state, { keyFor: ctx.keyFor, pushFeed: ctx.pushFeed, renderHud: ctx.renderHud, sendGameMessage: ctx.sendGameMessage });
  const cancelOngoingCapture = (): void => ctx.cancelOngoingCaptureFromModule(state, ctx.sendGameMessage);
  const collectVisibleYield = (): void =>
    ctx.collectVisibleYieldFromModule(state, {
      formatCooldownShort: ctx.formatCooldownShort,
      showCollectVisibleCooldownAlert: ctx.showCollectVisibleCooldownAlert,
      pushFeed: ctx.pushFeed,
      renderHud: ctx.renderHud,
      applyOptimisticVisibleCollect: ctx.applyOptimisticVisibleCollect,
      sendGameMessage: ctx.sendGameMessage
    });
  const collectSelectedYield = (): void =>
    ctx.collectSelectedYieldFromModule(state, { keyFor: ctx.keyFor, renderHud: ctx.renderHud, applyOptimisticTileCollect: ctx.applyOptimisticTileCollect, sendGameMessage: ctx.sendGameMessage });
  const collectSelectedShard = (): void => ctx.collectSelectedShardFromModule(state, { keyFor: ctx.keyFor, renderHud: ctx.renderHud, sendGameMessage: ctx.sendGameMessage });

  const handleTileAction = (actionId: string, _targetKeyOverride?: string, _originKeyOverride?: string): void => {
    const singleTargetKey = state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
    const selected = singleTargetKey ? state.tiles.get(singleTargetKey) : state.selected ? state.tiles.get(ctx.keyFor(state.selected.x, state.selected.y)) : undefined;
    const bulkKeys = state.tileActionMenu.mode === "bulk" ? state.tileActionMenu.bulkKeys : [];
    const fromBulk = bulkKeys.length > 0;
    const targets = fromBulk ? bulkKeys : selected ? [ctx.keyFor(selected.x, selected.y)] : [];
    if (targets.length === 0) return ctx.hideTileActionMenu();
    if (actionId === "settle_land") {
      if (fromBulk) {
        const neutralTargets = targets.filter((k) => {
          const t = state.tiles.get(k);
          return t && t.terrain === "LAND" && !t.ownerId;
        });
        const out = ctx.queueSpecificTargets(neutralTargets, "normal");
        if (out.queued > 0) ctx.processActionQueue();
        ctx.pushFeed(out.queued > 0 ? `Queued ${out.queued} frontier captures${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.` : "No frontier claims queued. Targets must touch your territory and you need enough gold.", "combat", out.queued > 0 ? "info" : "warn");
      } else if (selected) {
        const k = ctx.keyFor(selected.x, selected.y);
        if (!selected.ownerId) {
          const out = ctx.queueSpecificTargets([k], "normal");
          if (out.queued > 0) {
            ctx.processActionQueue();
            ctx.pushFeed(`Queued frontier capture at (${selected.x}, ${selected.y}).`, "combat", "info");
          } else {
            ctx.pushFeed("Cannot claim this tile yet. It must touch your territory and you need enough gold.", "combat", "warn");
          }
        } else if (selected.ownerId === state.me && selected.ownershipState === "FRONTIER" && ctx.requestSettlement(selected.x, selected.y)) {
          ctx.pushFeed(`Settlement started at (${selected.x}, ${selected.y}).`, "combat", "info");
        }
        state.autoSettleTargets.delete(k);
      }
      ctx.hideTileActionMenu();
      return;
    }
    if (actionId === "launch_attack" || actionId === "launch_breach_attack") {
      const enemyTargets = targets.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && t.ownerId && t.ownerId !== state.me && !ctx.isTileOwnedByAlly(t);
      });
      const mode = actionId === "launch_breach_attack" ? "breakthrough" : "normal";
      const out = ctx.queueSpecificTargets(enemyTargets, mode);
      if (out.queued > 0) ctx.processActionQueue();
      if (out.queued > 0) {
        ctx.pushFeed(`Queued ${out.queued} attacks${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "warn");
      } else {
        const singleTile = !fromBulk && selected ? selected : undefined;
        const failureMessage = singleTile ? ctx.attackQueueFailureReason(singleTile, mode) : `Cannot launch ${mode === "breakthrough" ? "breakthrough " : ""}attack for one or more selected tiles.`;
        ctx.showCaptureAlert(`${mode === "breakthrough" ? "Breach attack" : "Attack"} failed`, failureMessage, "warn");
        ctx.pushFeed(failureMessage, "combat", "error");
      }
      ctx.hideTileActionMenu();
      return;
    }
    if (actionId === "collect_yield" && fromBulk) {
      let n = 0;
      for (const k of targets) {
        const t = state.tiles.get(k);
        if (!t || t.ownerId !== state.me) continue;
        ctx.sendGameMessage({ type: "COLLECT_TILE", x: t.x, y: t.y });
        n += 1;
      }
      ctx.pushFeed(`Collecting from ${n} selected tiles.`, "info", "info");
      ctx.hideTileActionMenu();
      return;
    }
    if (!selected) return ctx.hideTileActionMenu();
    if (actionId === "collect_yield") collectSelectedYield();
    if (actionId === "collect_shard") collectSelectedShard();
    if (actionId === "build_fortification") ctx.sendDevelopmentBuild({ type: "BUILD_FORT", x: selected.x, y: selected.y }, () => ctx.applyOptimisticStructureBuild(selected.x, selected.y, "FORT"), { x: selected.x, y: selected.y, label: `Fortification at (${selected.x}, ${selected.y})`, optimisticKind: "FORT" });
    const economicBuilds: Record<string, string> = { build_wooden_fort: "WOODEN_FORT", build_farmstead: "FARMSTEAD", build_camp: "CAMP", build_mine: "MINE", build_market: "MARKET", build_granary: "GRANARY", build_bank: "BANK", build_airport: "AIRPORT", build_caravanary: "CARAVANARY", build_fur_synthesizer: "FUR_SYNTHESIZER", upgrade_fur_synthesizer: "ADVANCED_FUR_SYNTHESIZER", build_ironworks: "IRONWORKS", upgrade_ironworks: "ADVANCED_IRONWORKS", build_crystal_synthesizer: "CRYSTAL_SYNTHESIZER", upgrade_crystal_synthesizer: "ADVANCED_CRYSTAL_SYNTHESIZER", build_fuel_plant: "FUEL_PLANT", build_foundry: "FOUNDRY", build_garrison_hall: "GARRISON_HALL", build_customs_house: "CUSTOMS_HOUSE", build_governors_office: "GOVERNORS_OFFICE", build_radar_system: "RADAR_SYSTEM", build_light_outpost: "LIGHT_OUTPOST" };
    if (actionId === "build_observatory") ctx.sendDevelopmentBuild({ type: "BUILD_OBSERVATORY", x: selected.x, y: selected.y }, () => ctx.applyOptimisticStructureBuild(selected.x, selected.y, "OBSERVATORY"), { x: selected.x, y: selected.y, label: `Observatory at (${selected.x}, ${selected.y})`, optimisticKind: "OBSERVATORY" });
    if (actionId === "build_siege_camp") ctx.sendDevelopmentBuild({ type: "BUILD_SIEGE_OUTPOST", x: selected.x, y: selected.y }, () => ctx.applyOptimisticStructureBuild(selected.x, selected.y, "SIEGE_OUTPOST"), { x: selected.x, y: selected.y, label: `Siege Camp at (${selected.x}, ${selected.y})`, optimisticKind: "SIEGE_OUTPOST" });
    if (actionId in economicBuilds) {
      const structureType = economicBuilds[actionId];
      const label = `${ctx.economicStructureName ? ctx.economicStructureName(structureType) : structureType} at (${selected.x}, ${selected.y})`;
      ctx.sendDevelopmentBuild(
        { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType },
        () => ctx.applyOptimisticStructureBuild(selected.x, selected.y, structureType),
        { x: selected.x, y: selected.y, label, optimisticKind: structureType }
      );
    }
    if (actionId === "remove_structure") {
      const optimisticKind = selected.fort ? "FORT" : selected.observatory ? "OBSERVATORY" : selected.siegeOutpost ? "SIEGE_OUTPOST" : selected.economicStructure?.type;
      const structureLabel = selected.fort ? "Fort" : selected.observatory ? "Observatory" : selected.siegeOutpost ? "Siege Outpost" : selected.economicStructure ? ctx.economicStructureName(selected.economicStructure.type) : undefined;
      if (optimisticKind && structureLabel) {
        ctx.sendDevelopmentBuild({ type: "REMOVE_STRUCTURE", x: selected.x, y: selected.y }, () => ctx.applyOptimisticStructureRemoval(selected.x, selected.y), { x: selected.x, y: selected.y, label: `Remove ${structureLabel} at (${selected.x}, ${selected.y})`, optimisticKind });
      }
    }
    const directActions: Record<string, Record<string, unknown>> = {
      overload_fur_synthesizer: { type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y },
      overload_ironworks: { type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y },
      overload_crystal_synthesizer: { type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y },
      enable_converter_structure: { type: "SET_CONVERTER_STRUCTURE_ENABLED", x: selected.x, y: selected.y, enabled: true },
      disable_converter_structure: { type: "SET_CONVERTER_STRUCTURE_ENABLED", x: selected.x, y: selected.y, enabled: false },
      create_mountain: { type: "CREATE_MOUNTAIN", x: selected.x, y: selected.y },
      remove_mountain: { type: "REMOVE_MOUNTAIN", x: selected.x, y: selected.y },
      abandon_territory: { type: "UNCAPTURE_TILE", x: selected.x, y: selected.y },
      purge_siphon: { type: "PURGE_SIPHON", x: selected.x, y: selected.y }
    };
    if (actionId in directActions) ctx.sendGameMessage(directActions[actionId]);
    if (actionId === "offer_truce_12h" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
      const targetName = ctx.playerNameForOwner(selected.ownerId);
      if (targetName) ctx.sendTruceRequest(targetName, 12);
    }
    if (actionId === "offer_truce_24h" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
      const targetName = ctx.playerNameForOwner(selected.ownerId);
      if (targetName) ctx.sendTruceRequest(targetName, 24);
    }
    if (actionId === "break_truce" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") ctx.breakTruce(selected.ownerId);
    if (actionId === "reveal_empire" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") ctx.sendGameMessage({ type: "REVEAL_EMPIRE", targetPlayerId: selected.ownerId });
    if (actionId === "aether_bridge") ctx.beginCrystalTargeting("aether_bridge");
    if (actionId === "siphon_tile") ctx.beginCrystalTargeting("siphon");
    ctx.hideTileActionMenu();
  };

  const showHoldBuildMenu = (x: number, y: number, clientX: number, clientY: number): void =>
    showClientHoldBuildMenu(
      {
        state,
        holdBuildMenuEl: ctx.holdBuildMenuEl,
        keyFor: ctx.keyFor,
        hideHoldBuildMenu: ctx.hideHoldBuildMenu,
        developmentSlotSummary: ctx.developmentSlotSummary,
        structureGoldCost: ctx.structureGoldCost,
        isOwnedBorderTile: ctx.isOwnedBorderTile,
        structureCostText: ctx.structureCostText,
        viewportSize: ctx.viewportSize,
        requestSettlement: ctx.requestSettlement,
        sendDevelopmentBuild: ctx.sendDevelopmentBuild,
        applyOptimisticStructureBuild: ctx.applyOptimisticStructureBuild,
        renderHud: ctx.renderHud
      },
      x,
      y,
      clientX,
      clientY
    );

  const mapInteractionFlags = { holdActivated: false, suppressNextClick: false };

  const handleTileSelection = (wx: number, wy: number, clientX: number, clientY: number): void => {
    if (mapInteractionFlags.holdActivated) return void (mapInteractionFlags.holdActivated = false);
    if (mapInteractionFlags.suppressNextClick) return void (mapInteractionFlags.suppressNextClick = false);
    ctx.hideHoldBuildMenu();
    ctx.hideTileActionMenu();
    const clicked = state.tiles.get(ctx.keyFor(wx, wy));
    const vis = ctx.tileVisibilityStateAt(wx, wy, clicked);
    if (state.crystalTargeting.active) {
      if (vis === "unexplored") return void ctx.renderHud();
      if (clicked) state.selected = { x: wx, y: wy };
      if (clicked && ctx.executeCrystalTargeting(clicked)) return void ctx.renderHud();
      if (clicked && vis === "visible") ctx.pushFeed(`${ctx.crystalTargetingTitle(state.crystalTargeting.ability)} can only target highlighted tiles.`, "combat", "warn");
      return void ctx.renderHud();
    }
    if (vis === "unexplored") {
      state.selected = undefined;
      return void ctx.renderHud();
    }
    if (vis === "fogged") {
      state.selected = { x: wx, y: wy };
      state.attackPreview = undefined;
      state.attackPreviewPendingKey = "";
      return void ctx.renderHud();
    }
    if (!clicked) {
      state.selected = { x: wx, y: wy };
      state.attackPreview = undefined;
      state.attackPreviewPendingKey = "";
      return void ctx.renderHud();
    }
    const to = clicked;
    state.selected = { x: wx, y: wy };
    const frontierOrigin = ctx.pickOriginForTarget(to.x, to.y, false);
    const clickOutcome = neutralTileClickOutcome({ isLand: to.terrain === "LAND", isFogged: Boolean(to.fogged), hasFrontierOrigin: Boolean(frontierOrigin), isNeutral: !to.ownerId });
    if (clickOutcome === "queue-adjacent-neutral") {
      if (!canAffordCost(state.gold, FRONTIER_CLAIM_COST)) {
        ctx.notifyInsufficientGoldForFrontierAction("claim");
        ctx.requestAttackPreviewForHover();
        return void ctx.renderHud();
      }
      if (ctx.enqueueTarget(to.x, to.y, "normal")) {
        ctx.processActionQueue();
        ctx.pushFeed(`Queued frontier capture (${to.x}, ${to.y}).`, "combat", "info");
      }
      ctx.requestAttackPreviewForHover();
      return void ctx.renderHud();
    }
    ctx.openSingleTileActionMenu(to, clientX, clientY);
    ctx.requestAttackPreviewForHover();
    ctx.renderHud();
  };

  return {
    shouldResetFrontierActionStateForError,
    buildFortOnSelected,
    settleSelected,
    buildSiegeOutpostOnSelected,
    uncaptureSelected,
    cancelOngoingCapture,
    collectVisibleYield,
    collectSelectedYield,
    collectSelectedShard,
    handleTileAction,
    showHoldBuildMenu,
    mapInteractionFlags,
    handleTileSelection
  };
};
