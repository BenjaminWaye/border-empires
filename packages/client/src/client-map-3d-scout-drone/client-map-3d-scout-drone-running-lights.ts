// Running dark past the border (docs/explore-scout-plan.md): over the player's own or allied land
// the scout drone shows its nav lights, tail strobe and antenna light; once the tile under it is
// anything else -- neutral, a rival's, Planetary Defense, or not known to the client at all -- they
// fade out over SCOUT_LIGHTS_FADE_MS and only a dim cyan sensor glow stays, so the player can
// still find it. Shared by the 3D overlay and the 2D glyph.
//
// Allocation-free per frame: the tile is looked up only when the drone enters a new tile, or
// every SCOUT_HOME_RECHECK_MS while it stays on one (ownership can change under it). The tile key
// string is built only on those lookups.

export const SCOUT_LIGHTS_FADE_MS = 500;
export const SCOUT_HOME_RECHECK_MS = 1_000;
/** How bright the cyan sensor glow stays while running dark (fraction of full). */
export const SCOUT_DARK_SENSOR_LEVEL = 0.35;

/** The slice of client state the home test reads (ClientState satisfies it). */
export type ScoutHomeSource = {
  readonly me: string;
  readonly allies: readonly string[];
  readonly tiles: ReadonlyMap<string, { readonly ownerId?: string | undefined }>;
};

export type ScoutRunningLights = {
  /** 1 = all lights on (home), 0 = running dark. */
  level: number;
  home: boolean;
  tileX: number;
  tileY: number;
  checkedAt: number;
  lastMs: number;
  primed: boolean;
};

export const createScoutRunningLights = (): ScoutRunningLights => ({ level: 1, home: true, tileX: 0, tileY: 0, checkedAt: 0, lastMs: 0, primed: false });

/** Whether the (wrapped, integer) tile is the player's own or an ally's. Unknown tiles are not home. */
export const isScoutHomeTile = (source: ScoutHomeSource, x: number, y: number): boolean => {
  const ownerId = source.tiles.get(`${x},${y}`)?.ownerId;
  if (!ownerId) return false;
  return ownerId === source.me || source.allies.includes(ownerId);
};

/** Forgets the drone's last position, so the next update starts fully lit or dark from the tile it is on. */
export const resetScoutRunningLights = (lights: ScoutRunningLights): void => {
  lights.primed = false;
};

/**
 * Advances the fade for the drone at fractional tile (x, y) at `nowMs`. `source` undefined means
 * no tile data at all (stories, tests): the lights stay on. Returns the light level 0..1.
 */
export const updateScoutRunningLights = (
  lights: ScoutRunningLights,
  x: number,
  y: number,
  world: { readonly width: number; readonly height: number },
  nowMs: number,
  source: ScoutHomeSource | undefined
): number => {
  const tileX = ((Math.round(x) % world.width) + world.width) % world.width;
  const tileY = ((Math.round(y) % world.height) + world.height) % world.height;
  const moved = !lights.primed || tileX !== lights.tileX || tileY !== lights.tileY;
  if (moved || nowMs - lights.checkedAt >= SCOUT_HOME_RECHECK_MS) {
    lights.home = source ? isScoutHomeTile(source, tileX, tileY) : true;
    lights.tileX = tileX;
    lights.tileY = tileY;
    lights.checkedAt = nowMs;
  }
  const target = lights.home ? 1 : 0;
  if (!lights.primed) {
    lights.level = target;
    lights.primed = true;
  } else {
    const step = Math.max(0, nowMs - lights.lastMs) / SCOUT_LIGHTS_FADE_MS;
    lights.level = target > lights.level ? Math.min(target, lights.level + step) : Math.max(target, lights.level - step);
  }
  lights.lastMs = nowMs;
  return lights.level;
};

/** The sensor glow's strength for a light level: full at home, SCOUT_DARK_SENSOR_LEVEL when dark. */
export const scoutSensorLevel = (level: number): number => SCOUT_DARK_SENSOR_LEVEL + (1 - SCOUT_DARK_SENSOR_LEVEL) * level;
