// Launch Attack (single tile, box-selected bulk, and Attack Connected Region)
// opens the same Normal / Extra / Double effort sheet
// March To uses (client-effort-confirm-sheet.ts) before queuing, so a manual
// attack can commit more than the target's muster floor for better odds
// (docs/replenishment-update-plan.md D6). The sheet only appears when at
// least one target is effort-eligible (SETTLED or holding captured ground,
// non-barbarian -- see isAttackEffortEligibleTarget); any other frontier or
// barbarian attack gains nothing
// from extra manpower, so it still fires on the first click -- unless the
// attack would raise a brand new muster flag: then the same sheet first asks
// where to raise it (docs/launch-attack-flag-placement-plan.md), with no
// effort controls when no target benefits from extra manpower.
import { MUSTER_COMMIT_PRESET_MULTIPLIERS, musterCommitPresetAmount, type MusterCommitPreset } from "../client-muster-commit-tab/client-muster-commit-tab.js";
import { previewBaseWinChanceForTarget, winChanceAtCommit } from "../client-queue-logic/client-attack-preview-logic.js";
import { showEffortConfirmSheet } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import { attackWarWarning } from "../client-attack-war-warning/client-attack-war-warning.js";
import { supplyTradeAttackWarningsForTargets } from "../client-supply-trade-attack-warning/client-supply-trade-attack-warning.js";
import { confirmSupplyTradeEnd, type SupplyTradeSheet } from "../client-flag-supply-trade-confirm/client-flag-supply-trade-confirm.js";
import {
  attackEffortFloorForTarget,
  clearAttackCommit,
  isAttackEffortEligibleTarget,
  setAttackCommit
} from "../client-attack-commit/client-attack-commit.js";
import { launchFlagPlacement, type LaunchFlagPlacement } from "./client-launch-attack-flag-placement.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

export type AttackLaunchScope = "single" | "bulk" | "region";

export type AttackLaunchDeps = {
  keyFor: (x: number, y: number) => string;
  pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  queueSpecificTargets: (targetKeys: string[]) => { queued: number; skipped: number; queuedKeys: string[] };
  processActionQueue: () => boolean;
  attackQueueFailureReason: (tile: Tile) => string;
  pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
  showCaptureAlert: (title: string, detail: string, tone?: "error" | "success" | "warn") => void;
  hideTileActionMenu: () => void;
  /** Test seam for the supply-trade confirm; defaults to the break-pact sheet. */
  showSupplyTradeSheet?: SupplyTradeSheet;
};

type EffortState = Pick<ClientState, "tiles" | "me" | "manpowerCap" | "attackCommitByTargetKey"> & Partial<Pick<ClientState, "domainIds">>;

const percent = (chance: number | undefined): string | undefined => (chance == null ? undefined : `${Math.round(chance * 100)}%`);

type PreviewDeps = Pick<AttackLaunchDeps, "keyFor" | "pickOriginForTarget">;

// The tile whose odds the open effort sheet shows. The tile menu closes when
// the sheet opens, and the attack preview's keepalive (client-attack-preview-
// keepalive-ticker.ts) only refreshed the open menu's tile -- so the cached
// preview aged out (5s TTL) under the sheet and every effort read the same
// stale or missing odds (2026-11-26 playtest: "Normal / Extra / Double all
// showed 37%"; the region sheet's win chance vanished after Double).
let sheetTargetKey: string | undefined;

/** The tile the open Launch Attack effort sheet shows odds for, if any. */
export const attackEffortSheetTargetKey = (): string | undefined => sheetTargetKey;

/**
 * Win chance at a commitment from the server preview, scaled per effort. Keeps
 * the last base it saw, so a preview refresh in flight doesn't blank the odds
 * or freeze them at another effort's value.
 */
const stickyCommitWinChance = (state: ClientState, tile: Tile, deps: PreviewDeps): ((commitManpower: number) => number | undefined) => {
  let lastBase: number | undefined;
  return (commitManpower) => {
    lastBase = previewBaseWinChanceForTarget(state, tile, deps) ?? lastBase;
    return lastBase === undefined ? undefined : winChanceAtCommit(state, tile, lastBase, commitManpower);
  };
};

const trackSheetTarget = (shown: boolean, deps: PreviewDeps, tile: Tile | undefined): void => {
  sheetTargetKey = shown && tile ? deps.keyFor(tile.x, tile.y) : undefined;
};

/** The sheet's only subtitle: "Starts war with House X" when the attack would start a war (client-attack-war-warning.ts). */
const warSubtitle = (state: ClientState, ownerIds: ReadonlyArray<string | undefined>): { subtitle?: string } => {
  const warning = attackWarWarning(state, ownerIds, Date.now());
  return warning ? { subtitle: warning } : {};
};

/** Records the chosen commitment, or clears a stale one when the player stayed at the floor. */
const recordCommit = (state: EffortState, tile: Tile, commitManpower: number): void => {
  if (commitManpower > attackEffortFloorForTarget(tile, state)) setAttackCommit(state, tile.x, tile.y, commitManpower);
  else clearAttackCommit(state, tile.x, tile.y);
};

/**
 * Opens the single-target effort sheet for an eligible tile. Returns false
 * (and does nothing) when the tile isn't eligible or no sheet could be shown
 * -- the caller then proceeds exactly as before, at the floor.
 */
export const promptAttackEffortForTarget = (
  state: ClientState,
  tile: Tile | undefined,
  options: { title: string; confirmLabel: string; onConfirm: (commitManpower: number | undefined) => void; placement?: LaunchFlagPlacement | undefined },
  deps: PreviewDeps
): boolean => {
  if (!isAttackEffortEligibleTarget(tile)) return false;
  const floor = attackEffortFloorForTarget(tile, state);
  const winChanceAt = stickyCommitWinChance(state, tile, deps);
  const handle = showEffortConfirmSheet({
    title: options.title,
    ...warSubtitle(state, [tile.ownerId]),
    floor,
    cap: Math.max(floor, state.manpowerCap),
    // Presets only: Normal / Extra / Double read at a glance; the cost and
    // win chance on the line below say what each buys.
    mode: "presets",
    ...(options.placement ? { flagSpots: options.placement.sheet } : {}),
    confirmLabel: options.confirmLabel,
    describe: (commitManpower) => {
      const winChance = percent(winChanceAt(commitManpower));
      return `${winChance ? `Win ${winChance} · ` : ""}${commitManpower} MP`;
    },
    onConfirm: (commitManpower) => {
      sheetTargetKey = undefined;
      options.placement?.apply();
      options.onConfirm(commitManpower > floor ? commitManpower : undefined);
    },
    onCancel: () => {
      sheetTargetKey = undefined;
    }
  });
  trackSheetTarget(handle !== undefined, deps, tile);
  return handle !== undefined;
};

const launchTitle = (scope: AttackLaunchScope, count: number): string => (scope === "region" ? `Attack region · ${count} tiles` : `Attack ${count} tiles`);

const enemyTargetKeys = (state: EffortState, targetKeys: string[], deps: Pick<AttackLaunchDeps, "isTileOwnedByAlly">): string[] =>
  targetKeys.filter((k) => {
    const t = state.tiles.get(k);
    return Boolean(t && t.terrain === "LAND" && t.ownerId && t.ownerId !== state.me && !deps.isTileOwnedByAlly(t));
  });

const queueAndReport = (
  enemyKeys: string[],
  request: { scope: AttackLaunchScope; selected: Tile | undefined },
  deps: AttackLaunchDeps
): void => {
  const out = deps.queueSpecificTargets(enemyKeys);
  if (out.queued > 0) {
    deps.processActionQueue();
    const where = request.scope === "region" ? " across the connected region" : "";
    deps.pushFeed(`Queued ${out.queued} attacks${where}${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "info");
    return;
  }
  const failureMessage =
    request.scope !== "bulk" && request.selected
      ? deps.attackQueueFailureReason(request.selected)
      : request.scope === "region"
        ? "Cannot attack this connected region right now."
        : "Cannot launch attack for one or more selected tiles.";
  deps.showCaptureAlert(request.scope === "region" ? "Connected region attack failed" : "Attack failed", failureMessage, "warn");
  deps.pushFeed(failureMessage, "combat", "error");
};

/**
 * Multi-target sheet: presets only, each eligible target gets its own floor
 * times the chosen multiplier. The tapped tile's win chance (when it is one of
 * the defended targets and has a preview) moves with the preset, so the
 * player can see what Extra/Double buy -- this sheet used to show only a
 * manpower total (2026-11-12 playtest: "Double didn't change the win %").
 */
const promptBulkEffort = (
  state: ClientState,
  eligible: Tile[],
  title: string,
  onConfirm: (preset: MusterCommitPreset) => void,
  focus?: { tile: Tile | undefined; deps: PreviewDeps },
  placement?: LaunchFlagPlacement
): boolean => {
  const focusTile = focus?.tile && eligible.includes(focus.tile) ? focus.tile : undefined;
  const winChanceAt = focusTile && focus ? stickyCommitWinChance(state, focusTile, focus.deps) : undefined;
  const focusOdds = (preset: MusterCommitPreset): string => {
    if (!focusTile || !winChanceAt) return "";
    const commit = musterCommitPresetAmount(preset, attackEffortFloorForTarget(focusTile, state));
    const chance = percent(winChanceAt(commit));
    return chance ? `Win ${chance} · ` : "";
  };
  const minFloor = Math.min(...eligible.map(tile => attackEffortFloorForTarget(tile, state)));
  const totalFor = (preset: MusterCommitPreset): number =>
    eligible.reduce((sum, tile) => sum + musterCommitPresetAmount(preset, attackEffortFloorForTarget(tile, state)), 0);
  const handle = showEffortConfirmSheet({
    title,
    ...warSubtitle(state, eligible.map((tile) => tile.ownerId)),
    floor: minFloor,
    cap: Math.max(minFloor, state.manpowerCap),
    mode: "presets",
    ...(placement ? { flagSpots: placement.sheet } : {}),
    confirmLabel: "Attack",
    describe: (_commit, preset) => `${focusOdds(preset ?? "normal")}${totalFor(preset ?? "normal")} MP total`,
    onConfirm: (_commit, preset) => {
      sheetTargetKey = undefined;
      placement?.apply();
      onConfirm(preset ?? "normal");
    },
    onCancel: () => {
      sheetTargetKey = undefined;
    }
  });
  if (focus) trackSheetTarget(handle !== undefined, focus.deps, focusTile);
  return handle !== undefined;
};

/**
 * The Launch Attack / Attack Connected Region tile-menu handler (single, bulk
 * and region). When any target belongs to a House the player trades with, it
 * first asks to confirm that the attack ends those supply trades — a sheet,
 * so it shows on touch and in every HUD, unlike a row tooltip. Then opens the
 * effort sheet when any target is effort-eligible, otherwise queues at once.
 */
export const launchAttacksWithEffort = (
  state: ClientState,
  request: { targetKeys: string[]; scope: AttackLaunchScope; selected: Tile | undefined },
  deps: AttackLaunchDeps
): void => {
  const enemyKeys = enemyTargetKeys(state, request.targetKeys, deps);
  deps.hideTileActionMenu();
  const supplyWarning = supplyTradeAttackWarningsForTargets(state, enemyKeys.map((k) => state.tiles.get(k)?.ownerId));
  confirmSupplyTradeEnd(supplyWarning, "Attack", () => launchWithEffort(state, request, enemyKeys, deps), deps.showSupplyTradeSheet);
};

const launchWithEffort = (
  state: ClientState,
  request: { targetKeys: string[]; scope: AttackLaunchScope; selected: Tile | undefined },
  enemyKeys: string[],
  deps: AttackLaunchDeps
): void => {
  const enemyTiles = enemyKeys.map((k) => state.tiles.get(k)).filter((tile): tile is Tile => tile !== undefined);
  const eligible = enemyTiles.filter((tile) => isAttackEffortEligibleTarget(tile));
  const launch = (): void => queueAndReport(enemyKeys, request, deps);
  const focus = request.selected ? state.tiles.get(deps.keyFor(request.selected.x, request.selected.y)) : undefined;
  const placement = launchFlagPlacement(state, enemyTiles, focus, deps.pickOriginForTarget);
  if (eligible.length === 0) {
    // attackCommitForTarget already ignores ineligible targets; clearing too
    // means a tile that later settles can't revive an old choice.
    for (const t of enemyTiles) clearAttackCommit(state, t.x, t.y);
    if (!placement || !promptFlagPlacementOnly(state, enemyTiles, request, placement, launch)) launch();
    return;
  }
  if (enemyKeys.length === 1 && eligible.length === 1) {
    const tile = eligible[0]!;
    const shown = promptAttackEffortForTarget(
      state,
      tile,
      {
        title: `Attack (${tile.x}, ${tile.y})`,
        confirmLabel: "Attack",
        placement,
        onConfirm: (commitManpower) => {
          recordCommit(state, tile, commitManpower ?? attackEffortFloorForTarget(tile, state));
          launch();
        }
      },
      deps
    );
    if (!shown) launch();
    return;
  }
  const title = launchTitle(request.scope, enemyKeys.length);
  const shown = promptBulkEffort(state, eligible, title, (preset) => {
    const multiplier = MUSTER_COMMIT_PRESET_MULTIPLIERS[preset];
    for (const tile of eligible) recordCommit(state, tile, Math.ceil(attackEffortFloorForTarget(tile, state) * multiplier));
    launch();
  }, { tile: focus, deps }, placement);
  if (!shown) launch();
};

/**
 * The sheet for targets where extra manpower buys nothing (barbarians, plain
 * frontier) when the attack would raise a new flag: only the flag spot.
 */
const promptFlagPlacementOnly = (
  state: ClientState,
  targets: Tile[],
  request: { scope: AttackLaunchScope },
  placement: LaunchFlagPlacement,
  launch: () => void
): boolean => {
  const only = targets.length === 1 ? targets[0] : undefined;
  const handle = showEffortConfirmSheet({
    title: only ? `Attack (${only.x}, ${only.y})` : launchTitle(request.scope, targets.length),
    floor: 1,
    cap: Math.max(1, state.manpowerCap),
    mode: "none",
    flagSpots: placement.sheet,
    confirmLabel: "Attack",
    onConfirm: () => {
      placement.apply();
      launch();
    }
  });
  return handle !== undefined;
};
