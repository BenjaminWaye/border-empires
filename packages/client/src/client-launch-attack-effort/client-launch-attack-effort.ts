// Launch Attack (single tile, box-selected bulk, and Attack Connected Region)
// and Expand To & Attack open the same Normal / Extra / Double effort sheet
// March To uses (client-effort-confirm-sheet.ts) before queuing, so a manual
// attack can commit more than the target's muster floor for better odds
// (docs/replenishment-update-plan.md D6). The sheet only appears when at
// least one target is effort-eligible (SETTLED, non-barbarian -- see
// isAttackEffortEligibleTarget); a frontier or barbarian attack gains nothing
// from extra manpower, so it still fires on the first click.
import { MUSTER_COMMIT_PRESET_MULTIPLIERS, musterCommitPresetAmount, type MusterCommitPreset } from "../client-muster-commit-tab/client-muster-commit-tab.js";
import { commitPreviewWinChanceForTarget } from "../client-queue-logic/client-attack-preview-logic.js";
import { showEffortConfirmSheet } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import {
  attackEffortFloorForTarget,
  clearAttackCommit,
  isAttackEffortEligibleTarget,
  setAttackCommit
} from "../client-attack-commit/client-attack-commit.js";
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
};

type EffortState = Pick<ClientState, "tiles" | "me" | "manpowerCap" | "attackCommitByTargetKey">;

const percent = (chance: number | undefined): string | undefined => (chance == null ? undefined : `${Math.round(chance * 100)}%`);

/** Records the chosen commitment, or clears a stale one when the player stayed at the floor. */
const recordCommit = (state: EffortState, tile: Tile, commitManpower: number): void => {
  if (commitManpower > attackEffortFloorForTarget(tile)) setAttackCommit(state, tile.x, tile.y, commitManpower);
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
  options: { title: string; confirmLabel: string; onConfirm: (commitManpower: number | undefined) => void },
  deps: Pick<AttackLaunchDeps, "keyFor" | "pickOriginForTarget">
): boolean => {
  if (!isAttackEffortEligibleTarget(tile)) return false;
  const floor = attackEffortFloorForTarget(tile);
  const handle = showEffortConfirmSheet({
    title: options.title,
    subtitle: "Settled tile — committing more manpower improves your odds.",
    floor,
    cap: Math.max(floor, state.manpowerCap),
    mode: "slider",
    confirmLabel: options.confirmLabel,
    describe: (commitManpower) => {
      const winChance = percent(commitPreviewWinChanceForTarget(state, tile, commitManpower, deps));
      return `${winChance ? `Win chance ${winChance}` : "Win chance shown once the target borders you"} · costs ${commitManpower} manpower`;
    },
    onConfirm: (commitManpower) => options.onConfirm(commitManpower > floor ? commitManpower : undefined)
  });
  return handle !== undefined;
};

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
    deps.pushFeed(`Queued ${out.queued} attacks${where}${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "warn");
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

/** Multi-target sheet: presets only, each eligible target gets its own floor times the chosen multiplier. */
const promptBulkEffort = (
  state: EffortState,
  eligible: Tile[],
  title: string,
  onConfirm: (preset: MusterCommitPreset) => void
): boolean => {
  const minFloor = Math.min(...eligible.map(attackEffortFloorForTarget));
  const totalFor = (preset: MusterCommitPreset): number =>
    eligible.reduce((sum, tile) => sum + musterCommitPresetAmount(preset, attackEffortFloorForTarget(tile)), 0);
  const handle = showEffortConfirmSheet({
    title,
    subtitle: `${eligible.length} settled target${eligible.length === 1 ? "" : "s"} — effort applies to each of them.`,
    floor: minFloor,
    cap: Math.max(minFloor, state.manpowerCap),
    mode: "presets",
    confirmLabel: "Attack",
    describe: (_commit, preset) => `About ${totalFor(preset ?? "normal")} manpower across the settled targets`,
    onConfirm: (_commit, preset) => onConfirm(preset ?? "normal")
  });
  return handle !== undefined;
};

/**
 * The Launch Attack / Attack Connected Region tile-menu handler. Opens the
 * effort sheet when any target is effort-eligible, otherwise queues at once.
 */
export const launchAttacksWithEffort = (
  state: ClientState,
  request: { targetKeys: string[]; scope: AttackLaunchScope; selected: Tile | undefined },
  deps: AttackLaunchDeps
): void => {
  const enemyKeys = enemyTargetKeys(state, request.targetKeys, deps);
  deps.hideTileActionMenu();
  const eligible = enemyKeys.map((k) => state.tiles.get(k)).filter(isAttackEffortEligibleTarget);
  const launch = (): void => queueAndReport(enemyKeys, request, deps);
  if (eligible.length === 0) {
    // attackCommitForTarget already ignores ineligible targets; clearing too
    // means a tile that later settles can't revive an old choice.
    for (const k of enemyKeys) {
      const t = state.tiles.get(k);
      if (t) clearAttackCommit(state, t.x, t.y);
    }
    launch();
    return;
  }
  if (enemyKeys.length === 1 && eligible.length === 1) {
    const tile = eligible[0]!;
    const shown = promptAttackEffortForTarget(
      state,
      tile,
      {
        title: `Launch attack on (${tile.x}, ${tile.y})`,
        confirmLabel: "Attack",
        onConfirm: (commitManpower) => {
          recordCommit(state, tile, commitManpower ?? attackEffortFloorForTarget(tile));
          launch();
        }
      },
      deps
    );
    if (!shown) launch();
    return;
  }
  const title = request.scope === "region" ? `Attack connected region (${enemyKeys.length})` : `Launch ${enemyKeys.length} attacks`;
  const shown = promptBulkEffort(state, eligible, title, (preset) => {
    const multiplier = MUSTER_COMMIT_PRESET_MULTIPLIERS[preset];
    for (const tile of eligible) recordCommit(state, tile, Math.ceil(attackEffortFloorForTarget(tile) * multiplier));
    launch();
  });
  if (!shown) launch();
};
