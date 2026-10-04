// Live-tunable 3D map lighting. The defaults below are the shipped values
// (client-map-3d-atmosphere.ts reads them at startup); the admin-only
// Settings > Admin > Lighting Tuner card overrides them at runtime so a
// lighting change can be judged on the real map before it is committed as a
// new default. Overrides persist in this browser only.

export type LightingSettings = {
  readonly hemiIntensity: number;
  readonly hemiSkyColor: string;
  readonly hemiGroundColor: string;
  readonly sunIntensity: number;
  readonly sunColor: string;
  // Compass direction the sun sits in (0 = straight toward the camera side,
  // +Z) and its height above the horizon; the shipped light is fixed to the
  // camera's own side so it doesn't need to track a rotating camera.
  readonly sunAzimuthDeg: number;
  readonly sunElevationDeg: number;
  readonly shadowIntensity: number;
  readonly fillIntensity: number;
  readonly fillColor: string;
  // Multiplier on the baked room-environment reflection that metallic
  // building materials (iron/brass/titanium) use as their only specular source.
  readonly envIntensity: number;
  readonly exposure: number;
};

const SUN_OFFSET_X = 8;
const SUN_OFFSET_Y = 42;
const SUN_OFFSET_Z = 60;
export const SUN_DISTANCE = Math.hypot(SUN_OFFSET_X, SUN_OFFSET_Y, SUN_OFFSET_Z);

export const DEFAULT_LIGHTING: LightingSettings = {
  hemiIntensity: 0.7,
  hemiSkyColor: "#b8c8ff",
  hemiGroundColor: "#2a2030",
  sunIntensity: 1.55,
  sunColor: "#fff0c0",
  sunAzimuthDeg: (Math.atan2(SUN_OFFSET_X, SUN_OFFSET_Z) * 180) / Math.PI,
  sunElevationDeg: (Math.asin(SUN_OFFSET_Y / SUN_DISTANCE) * 180) / Math.PI,
  shadowIntensity: 0.6,
  fillIntensity: 0.55,
  fillColor: "#ff8a5c",
  envIntensity: 0.5,
  exposure: 1.1
};

export type LightingNumberKey = {
  [K in keyof LightingSettings]: LightingSettings[K] extends number ? K : never;
}[keyof LightingSettings];
export type LightingColorKey = {
  [K in keyof LightingSettings]: LightingSettings[K] extends string ? K : never;
}[keyof LightingSettings];

export const LIGHTING_NUMBER_RANGES: Record<LightingNumberKey, { min: number; max: number; step: number }> = {
  hemiIntensity: { min: 0, max: 3, step: 0.05 },
  sunIntensity: { min: 0, max: 4, step: 0.05 },
  sunAzimuthDeg: { min: -180, max: 180, step: 1 },
  sunElevationDeg: { min: 10, max: 90, step: 1 },
  shadowIntensity: { min: 0, max: 1, step: 0.05 },
  fillIntensity: { min: 0, max: 3, step: 0.05 },
  envIntensity: { min: 0, max: 3, step: 0.05 },
  exposure: { min: 0.3, max: 2.5, step: 0.05 }
};

const STORAGE_KEY = "be-lighting-tuner";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// Never trust storage: a stale or hand-edited entry falls back per-field to the default.
const sanitize = (raw: unknown): LightingSettings => {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const next: Record<string, number | string> = { ...DEFAULT_LIGHTING };
  for (const key of Object.keys(DEFAULT_LIGHTING) as Array<keyof LightingSettings>) {
    const fallback = DEFAULT_LIGHTING[key];
    const value = source[key];
    if (typeof fallback === "number") {
      const range = LIGHTING_NUMBER_RANGES[key as LightingNumberKey];
      if (typeof value === "number" && Number.isFinite(value)) next[key] = clamp(value, range.min, range.max);
    } else if (typeof value === "string" && HEX_COLOR.test(value)) {
      next[key] = value;
    }
  }
  return next as LightingSettings;
};

const load = (): LightingSettings => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? sanitize(JSON.parse(stored)) : { ...DEFAULT_LIGHTING };
  } catch {
    return { ...DEFAULT_LIGHTING };
  }
};

const persist = (settings: LightingSettings): void => {
  try {
    if (lightingIsDefault(settings)) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const lightingIsDefault = (settings: LightingSettings): boolean =>
  (Object.keys(DEFAULT_LIGHTING) as Array<keyof LightingSettings>).every((key) => settings[key] === DEFAULT_LIGHTING[key]);

let current: LightingSettings | undefined;
// One listener per live 3D renderer (createAtmosphere); a renderer teardown
// unsubscribes, so this is bounded by the number of concurrent renderers.
const listeners = new Set<(settings: LightingSettings) => void>();

export const getLightingSettings = (): LightingSettings => {
  current ??= load();
  return current;
};

export const setLightingSetting = <K extends keyof LightingSettings>(key: K, value: LightingSettings[K]): void => {
  current = sanitize({ ...getLightingSettings(), [key]: value });
  persist(current);
  listeners.forEach((listener) => listener(current as LightingSettings));
};

export const resetLightingSettings = (): void => {
  current = { ...DEFAULT_LIGHTING };
  persist(current);
  listeners.forEach((listener) => listener(current as LightingSettings));
};

export const subscribeLightingSettings = (listener: (settings: LightingSettings) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The settings as pasteable source, so a tuned look can be committed as the new DEFAULT_LIGHTING. */
export const lightingSettingsAsSource = (settings: LightingSettings): string => {
  const rounded = (Object.keys(settings) as Array<keyof LightingSettings>).map((key) => {
    const value = settings[key];
    return `  ${key}: ${typeof value === "number" ? Number(value.toFixed(3)) : JSON.stringify(value)}`;
  });
  return `{\n${rounded.join(",\n")}\n}`;
};
