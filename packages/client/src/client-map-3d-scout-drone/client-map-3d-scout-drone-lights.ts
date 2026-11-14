import type { ScoutDroneModel, ScoutLight } from "./client-map-3d-scout-drone-model.js";
import { scoutSensorLevel } from "./client-map-3d-scout-drone-running-lights.js";

// Sets the scout drone's lights for one frame (client-map-3d-scout-drone-overlay.ts). `level` is
// the running-lights level from client-map-3d-scout-drone-running-lights.ts: 1 over home land,
// 0 running dark past the border, in between while it fades. The red/green nav lights, tail
// strobe, antenna light and cyan belly light scale with it; the cyan sensor lens and chine seams
// never go out, only dim to SCOUT_DARK_SENSOR_LEVEL. No allocation.

const BEAD_INTENSITY = 3;

const setLight = (light: ScoutLight, strength: number, glowScale = 1): void => {
  light.material.color.copy(light.base).multiplyScalar(strength);
  light.bead.emissiveIntensity = BEAD_INTENSITY * strength;
  light.glow.visible = strength > 0.005;
  light.glow.scale.setScalar(light.size * glowScale);
};

export const applyScoutDroneLights = (model: ScoutDroneModel, level: number, pulse: number, animate: boolean, nowMs: number): void => {
  const sensor = scoutSensorLevel(level);
  model.lens.emissiveIntensity = (2 + 1.2 * pulse) * sensor;
  model.seams.emissiveIntensity = 1.3 * sensor; // the cyan chine seams dim with the sensor, never fully off
  setLight(model.lights.lens, (0.7 + 0.3 * pulse) * sensor);
  setLight(model.lights.belly, (0.55 + 0.35 * pulse) * level);
  setLight(model.lights.navLeft, level);
  setLight(model.lights.navRight, level);
  const strobeOn = animate ? nowMs % 1_150 < 90 : false;
  setLight(model.lights.strobe, (strobeOn ? 1 : 0.12) * level, strobeOn ? 1.6 : 0.6);
  const antennaOn = animate ? nowMs % 1_600 < 700 : true;
  setLight(model.lights.antenna, (antennaOn ? 0.9 : 0.2) * level);
};
