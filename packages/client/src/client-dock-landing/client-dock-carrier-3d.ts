import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Scene } from "three";
import { WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";
import { clamp01 } from "../client-map-3d-popup-marine/popup-marine-timeline.js";
import { landingCarrierPose, landingCarrierScenePoint, SAIL_MS } from "./client-dock-landing.js";
import type { BattleOverlayRenderEntry, BattleOverlaySkirmishEntry } from "./client-battle-render-types.js";

type CarrierBattle = BattleOverlayRenderEntry | BattleOverlaySkirmishEntry;
const MAX_CARRIERS = 16;

/** Fixed pool, updated from tile coordinates every frame just like the marines. */
export function createDockCarrierOverlay(scene: Scene): {
  tick: (battles: readonly CarrierBattle[], nowMs: number) => void;
  clear: () => void;
  dispose: () => void;
} {
  const geometry = new BoxGeometry(1, 1, 1);
  const armor = new MeshStandardMaterial({ color: "#495864", metalness: 0.7, roughness: 0.45 });
  const deck = new MeshStandardMaterial({ color: "#17222b", metalness: 0.4, roughness: 0.7 });
  const rampMaterial = new MeshStandardMaterial({ color: "#71818b", metalness: 0.6, roughness: 0.5 });
  const carriers = Array.from({ length: MAX_CARRIERS }, () => {
    const root = new Group(); root.name = "dock-assault-carrier"; root.visible = false;
    const accent = new MeshStandardMaterial({ color: "#8bd5ff", emissive: "#8bd5ff", emissiveIntensity: 0.4 });
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, material: MeshStandardMaterial): Mesh => {
      const mesh = new Mesh(geometry, material); mesh.scale.set(w, h, d); mesh.position.set(x, y, z);
      root.add(mesh); return mesh;
    };
    // Twin armored sponsons frame an open troop bay; forward is local +Z.
    part(0.42, 0.07, 0.60, 0, 0.02, 0, deck);
    for (const side of [-1, 1]) {
      part(0.105, 0.17, 0.65, side * 0.21, 0.085, -0.015, armor);
      part(0.11, 0.025, 0.28, side * 0.21, 0.18, -0.1, accent);
      part(0.12, 0.12, 0.14, side * 0.21, 0.08, -0.37, deck);
      part(0.065, 0.03, 0.015, side * 0.21, 0.1, 0.32, accent);
    }
    part(0.34, 0.15, 0.12, 0, 0.10, -0.25, armor);
    part(0.29, 0.09, 0.17, 0, 0.21, -0.22, armor);
    part(0.23, 0.035, 0.015, 0, 0.225, -0.125, accent);
    // Low roof over the bay leaves the forward mouth and ramp unobstructed.
    part(0.32, 0.025, 0.25, 0, 0.185, -0.055, armor);
    const hinge = new Group(); hinge.position.set(0, 0.055, 0.30); root.add(hinge);
    const ramp = new Mesh(geometry, rampMaterial); ramp.scale.set(0.30, 0.022, 0.24);
    ramp.position.z = 0.12; hinge.add(ramp);
    // Ribs make the open ramp readable at ordinary map zoom.
    for (let i = 1; i < 5; i++) {
      const rib = new Mesh(geometry, deck); rib.scale.set(0.27, 0.006, 0.008);
      rib.position.set(0, 0.014, i * 0.045); hinge.add(rib);
    }
    scene.add(root);
    return { root, hinge, accent };
  });
  const clear = (): void => { for (const carrier of carriers) carrier.root.visible = false; };
  const tick = (battles: readonly CarrierBattle[], nowMs: number): void => {
    clear(); let slot = 0;
    for (const battle of battles) {
      if (!battle.landing) continue;
      const carrier = carriers[slot++]; if (!carrier) break;
      const pose = landingCarrierPose(battle.landing, nowMs);
      carrier.root.visible = true;
      const beachT = clamp01((nowMs - battle.landing.startAt - SAIL_MS * 0.8) / (SAIL_MS * 0.2));
      const surfaceY = WATER_SURFACE_Y + (battle.tgtSurfaceY - WATER_SURFACE_Y) * beachT;
      const point = landingCarrierScenePoint(battle.tgtWorldX, battle.tgtWorldZ, pose);
      carrier.root.position.set(point.x, surfaceY, point.z);
      carrier.root.rotation.y = pose.yaw;
      // Closed vertical bow door lowers to a gently sloping beach ramp.
      carrier.hinge.rotation.x = -Math.PI / 2 + pose.rampOpen * (Math.PI / 2 + 0.18);
      carrier.accent.color.set(battle.attackerColor); carrier.accent.emissive.set(battle.attackerColor);
    }
  };
  return { tick, clear, dispose: () => {
    for (const carrier of carriers) { scene.remove(carrier.root); carrier.accent.dispose(); }
    geometry.dispose(); armor.dispose(); deck.dispose(); rampMaterial.dispose();
  } };
}
