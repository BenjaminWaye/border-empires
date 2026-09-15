// Siege Tower aim mode — how a siege tower (SIEGE_TOWER / DREAD_TOWER) tracks
// the latest ongoing battle on the 3D map. Two deliberate modes:
//
//  - "lens":  only the aether lens assembly (gimbal rings + lens + beam) rotates
//             to track the battle; the tower stays planted on its axis.
//  - "structure": the entire tower swings around to face the battle.
//
// Persisted to localStorage so the player's choice survives reloads, with a
// `?siegetower=lens|structure` URL param taking precedence (handy for a
// screenshot/demo build and for regression tests). The default is "lens" — the
// dramatic, historically-flavoured look — while "structure" exists for anyone
// who wants the whole machine to wheel about.

export type SiegeTowerRotationMode = "lens" | "structure";

const STORAGE_KEY = "border-empires-siege-tower-rotation-mode";
const VALID_MODES: readonly SiegeTowerRotationMode[] = ["lens", "structure"];

const isRotationMode = (value: unknown): value is SiegeTowerRotationMode =>
  typeof value === "string" && (VALID_MODES as readonly string[]).includes(value);

const urlOverride = (): SiegeTowerRotationMode | undefined => {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get("siegetower");
  return isRotationMode(value) ? value : undefined;
};

const storedMode = (): SiegeTowerRotationMode | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isRotationMode(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

let mode: SiegeTowerRotationMode = urlOverride() ?? storedMode() ?? "lens";

export const siegeTowerRotationMode = (): SiegeTowerRotationMode => mode;

export const setSiegeTowerRotationMode = (next: SiegeTowerRotationMode): void => {
  mode = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode / storage disabled — the in-memory mode still applies.
  }
};