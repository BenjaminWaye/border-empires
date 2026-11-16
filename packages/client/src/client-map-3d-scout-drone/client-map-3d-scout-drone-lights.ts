import type { ScoutDroneModel, ScoutLight } from "./client-map-3d-scout-drone-model.js";
import { scoutSensorLevel } from "./client-map-3d-scout-drone-running-lights.js";

// Sets the scout drone's lights for one frame (client-map-3d-scout-drone-overlay.ts). `level` is
// the running-lights level from client-map-3d-scout-drone-running-lights.ts: 1 over home land,
// 0 running dark past the border, in between while it fades.
//  - Red/green nav lights and the tail strobe (an aircraft-style double flash) scale with it.
//  - The REC light blinks while the drone is outbound, and goes out with the running lights.
//  - The cyan camera iris, status light, charge LEDs and the glint in the sensor lenses never go
//    out; they dim to SCOUT_DARK_SENSOR_LEVEL.
// No allocation.

const BEAD_INTENSITY = 3;
const STROBE_PERIOD_MS = 1_300;

const setLight = (light: ScoutLight, strength: number, glowScale = 1): void => {
  light.material.color.copy(light.base).multiplyScalar(strength);
  light.bead.emissiveIntensity = BEAD_INTENSITY * strength;
  light.glow.visible = strength > 0.005;
  light.glow.scale.setScalar(light.size * glowScale);
};

/** The strobe's double flash: two short pulses close together, then a pause. */
export const scoutStrobeOn = (nowMs: number): boolean => {
  const t = nowMs % STROBE_PERIOD_MS;
  return t < 55 || (t >= 150 && t < 205);
};

export const applyScoutDroneLights = (model: ScoutDroneModel, level: number, pulse: number, animate: boolean, nowMs: number, outbound: boolean): void => {
  const sensor = scoutSensorLevel(level);
  model.lens.emissiveIntensity = (2 + 1.2 * pulse) * sensor;
  model.glass.emissiveIntensity = 0.04 * sensor;
  model.leds.emissiveIntensity = 1.6 * sensor;
  setLight(model.lights.lens, (0.7 + 0.3 * pulse) * sensor);
  setLight(model.lights.status, (0.55 + 0.35 * pulse) * sensor);
  setLight(model.lights.navLeft, level);
  setLight(model.lights.navRight, level);
  const strobeOn = animate ? scoutStrobeOn(nowMs) : false;
  setLight(model.lights.strobe, (strobeOn ? 1 : 0) * level, 1.5); // dark between flashes, no idle glow
  const recOn = outbound && (animate ? nowMs % 1_000 < 500 : true);
  setLight(model.lights.rec, (recOn ? 1 : 0.1) * level);
};
