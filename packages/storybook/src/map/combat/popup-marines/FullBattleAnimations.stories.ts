import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { battleClashMs, COMBAT_LOCK_MS, type BattlePresentation } from "@border-empires/shared";
import { createPopupMarineOverlayFx, APPROACH_MS, ROUT_MS, type BattleOverlayRenderEntry, type BattleOverlaySkirmishEntry } from "@client/client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import { skirmishCasualtyMasksAt } from "@client/client-map-3d-popup-marine/popup-marine-full-casualties.js";
import { choreographyApproachMs, type BattleChoreography } from "@client/client-map-3d-popup-marine/popup-marine-choreography.js";
import { drawBattleMarkers2D } from "@client/client-battle-overlay/client-battle-overlay-2d.js";
import type { ActiveBattleOverlay } from "@client/client-battle-overlay/client-battle-overlay.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

type Args = { presentation: BattlePresentation; choreography: BattleChoreography; attackerWon: boolean; cameraDistance: number };
const PATTERNS: readonly BattleChoreography[] = ["assault", "crossfire", "holdout", "counterpush"];
const render = (args: Args): HTMLElement => {
  const stage = createStage({ width: 960, height: 540, cameraDistance: args.cameraDistance, background: "#171e27" });
  const fx = createPopupMarineOverlayFx(stage.scene);
  const ground = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ color: "#52634f", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; stage.scene.add(ground);
  const panel = document.createElement("div");
  panel.style.cssText = "padding:12px;color:#eef2f6;background:#171e27;font:13px sans-serif;display:flex;align-items:center;gap:12px;flex-wrap:wrap";
  const replay = document.createElement("button"); replay.textContent = "Replay full battle";
  const slider = document.createElement("input"); slider.type = "range"; slider.min = "0"; slider.step = "1"; slider.style.width = "280px"; slider.setAttribute("aria-label", "Battle time");
  const label = document.createElement("span"); label.style.cssText = "width:230px";
  const canvas = document.createElement("canvas"); canvas.width = 180; canvas.height = 180;
  canvas.style.cssText = "background:#293729;border:1px solid #8b9c89"; canvas.setAttribute("aria-label", "Matching 2D battle");
  panel.append(replay, slider, label, canvas);
  const duration = battleClashMs(args.presentation);
  const totalMs = COMBAT_LOCK_MS + duration + ROUT_MS;
  slider.max = String(totalMs); slider.value = "0";
  let startedAt = performance.now(); let paused = false;
  replay.onclick = () => { startedAt = performance.now(); paused = false; };
  slider.oninput = () => { paused = true; };
  const targetX = Math.max(0, PATTERNS.indexOf(args.choreography));
  const key = `${targetX},0`;
  const battle: ActiveBattleOverlay = { originX: targetX - 1, originY: 0, targetX, targetY: 0,
    attackerOwnerId: "attacker", defenderOwnerId: "defender", attackerWon: args.attackerWon,
    startAt: COMBAT_LOCK_MS - APPROACH_MS, clashAt: COMBAT_LOCK_MS, endAt: totalMs,
    presentation: args.presentation, fromSkirmish: true, skirmishCasualties: true, choreographyStartAt: 0 };
  const entry: BattleOverlayRenderEntry = { ...battle, srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 0, tgtWorldZ: 0,
    srcSurfaceY: 0, tgtSurfaceY: 0, attackerColor: "#ffcf55", defenderColor: "#6fbaff", hashSeed: targetX * 92821,
    choreography: args.choreography };
  const skirmish: BattleOverlaySkirmishEntry = { ...entry, startAt: 0 };
  const fallen = skirmishCasualtyMasksAt(skirmish, COMBAT_LOCK_MS);
  battle.fallenBeforeResolution = fallen; entry.fallenBeforeResolution = fallen;
  const colors = new Map([["attacker", entry.attackerColor], ["defender", entry.defenderColor]]);
  let raf = 0;
  const tick = (): void => {
    const now = paused ? Number(slider.value) : (performance.now() - startedAt) % (totalMs + 1200);
    if (!paused) slider.value = String(Math.min(totalMs, now));
    const unresolved = now < COMBAT_LOCK_MS;
    const phase = unresolved ? now < 200 ? "Deploying" : now < choreographyApproachMs(skirmish) ? "Advancing" : "Exchanging fire" : now < COMBAT_LOCK_MS + duration ? "Battle decided" : "Advancing / retreating";
    label.textContent = `${phase} · ${(now / 1000).toFixed(1)}s${unresolved ? ` · ${Math.ceil((COMBAT_LOCK_MS - now) / 1000)}s until resolution` : ""}`;
    if (unresolved) fx.tick(now, [], [skirmish]); else fx.tick(now, [entry]);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 180, 180);
      drawBattleMarkers2D(ctx, { activeBattles: unresolved ? new Map() : new Map([[key, battle]]), playerColors: colors },
        [{ px: 15, py: 15, wk: key, vis: "visible" }], { size: 150, project: () => ({ sx: 90, sy: 90 }) }, now,
        unresolved ? new Map([[key, skirmish]]) : undefined);
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  const root = wrapWithCleanup(stage, [() => { cancelAnimationFrame(raf); fx.dispose(); ground.geometry.dispose(); ground.material.dispose(); }]);
  root.append(panel); return root;
};
const meta: Meta<Args> = {
  id: "map-combat-popup-marines-battle-endings",
  title: "Map/Combat/Popup Marines/Full Battle Animations", render,
  args: { presentation: "decisive", choreography: "assault", attackerWon: true, cameraDistance: 4.5 },
  argTypes: {
    presentation: { control: false, table: { disable: true } }, choreography: { control: false, table: { disable: true } },
    attackerWon: { control: false, table: { disable: true } }, cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } }
  }
};
export default meta;
type Story = StoryObj<Args>;
export const FullBattleDecisive: Story = { name: "Decisive assault", args: { presentation: "decisive", choreography: "assault" } };
export const FullBattleContested: Story = { name: "Contested firefight", args: { presentation: "contested", choreography: "crossfire" } };
export const FullBattleLastStand: Story = { name: "Failed last stand", args: { presentation: "last-stand", choreography: "holdout", attackerWon: false } };
export const FullBattleComeback: Story = { name: "Comeback", args: { presentation: "comeback", choreography: "counterpush" } };
