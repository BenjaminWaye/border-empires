// Siege Tower aim mode — how a siege tower (SIEGE_TOWER / DREAD_TOWER) tracks
// the latest ongoing battle on the 3D map. Two deliberate modes:
//
//  - "lens":  only the aether lens assembly (gimbal rings + lens + beam) rotates
//             to track the battle; the tower stays planted on its axis.
//  - "structure": the entire tower swings around to face the battle.
//
// Always "lens" — the dramatic, historically-flavoured look — unless a
// `?siegetower=lens|structure` URL param overrides it (handy for a
// screenshot/demo build and for regression tests). The Settings dropdown that
// used to let players pick (and persisted the choice to localStorage) was
// removed, so any previously stored choice is deliberately ignored rather than
// leaving a player stuck on a mode they can no longer change.

export type SiegeTowerRotationMode = "lens" | "structure";

const VALID_MODES: readonly SiegeTowerRotationMode[] = ["lens", "structure"];

const isRotationMode = (value: unknown): value is SiegeTowerRotationMode =>
  typeof value === "string" && (VALID_MODES as readonly string[]).includes(value);

const urlOverride = (): SiegeTowerRotationMode | undefined => {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get("siegetower");
  return isRotationMode(value) ? value : undefined;
};

const mode: SiegeTowerRotationMode = urlOverride() ?? "lens";

export const siegeTowerRotationMode = (): SiegeTowerRotationMode => mode;
