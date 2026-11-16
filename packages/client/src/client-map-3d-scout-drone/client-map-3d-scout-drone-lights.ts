import type { ScoutDroneModel, ScoutLight } from "./client-map-3d-scout-drone-model.js";
import { scoutSensorLevel } from "./client-map-3d-scout-drone-running-lights.js";

// Sets the scout drone's lights for one frame (client-map-3d-scout-drone-overlay.ts). `level` is
// the running-lights level from client-map-3d-scout-drone-running-lights.ts: 1 over home land,
// 0 running dark past the border, in between while it fades.
//  - The pod LEDs are the running lights: red/green nav lights on the front pods and cyan on the
//    rear pods scale with it, and so does the strobe -- a tiny sharp point on the rear-left pod
//    that double-flashes (two ~55 ms pulses, then a pause) and is fully dark in between.
//  - The REC light beside the eye blinks while the drone is outbound, and goes out with them.
//  - The eye's pupil and the two lower-front LED slots never go out; they dim to
//    SCOUT_DARK_SENSOR_LEVEL.
// `far` (0 close .. 1 at the gameplay camera distance) grows the eye's halo so the cyan dot stays
// a crisp point from afar without changing the close-up look. No allocation.

const BEAD_INTENSITY = 3;
const STROBE_PERIOD_MS = 1_300;
const STROBE_PEAK = 0.45;

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

export const applyScoutDroneLights = (model: ScoutDroneModel, level: number, pulse: number, animate: boolean, nowMs: number, outbound: boolean, far = 0): void => {
  const sensor = scoutSensorLevel(level);
  model.pupil.emissiveIntensity = (1.4 + 0.8 * pulse) * sensor;
  model.frontSlots.emissiveIntensity = 1.8 * sensor;
  model.podSlots.emissiveIntensity = 1.8 * level;
  setLight(model.lights.eye, (0.7 + 0.3 * pulse) * sensor, 1 + 2.4 * far);
  setLight(model.lights.navLeft, level);
  setLight(model.lights.navRight, level);
  const strobeOn = animate ? scoutStrobeOn(nowMs) : false;
  // Dark between flashes, no idle glow; held below the bloom's spread even while lit, so each flash
  // is a sharp pinpoint rather than a blob.
  setLight(model.lights.strobe, (strobeOn ? STROBE_PEAK : 0) * level);
  const recOn = outbound && (animate ? nowMs % 1_000 < 500 : true);
  setLight(model.lights.rec, (recOn ? 1 : 0.1) * level);
};
