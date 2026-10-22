// Client half of the simulation's ISLAND_NAMES push
// (apps/simulation/src/island-names/island-names-ticker.ts): every nameable
// island's label placement, current name and held / contested / fading state
// (shared island-names.ts). Always a full replacement list.
import type { IslandLabel, IslandNameStatus } from "@border-empires/shared";

export const createInitialIslandNamesState = () => ({
  /** `undefined` until the first ISLAND_NAMES arrives; island labels are simply not drawn until then. */
  islandLabels: undefined as readonly IslandLabel[] | undefined
});

type IslandNamesState = ReturnType<typeof createInitialIslandNamesState>;

const STATUSES: readonly IslandNameStatus[] = ["default", "held", "contested", "fading"];

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const parseIslandLabel = (value: unknown): IslandLabel | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.name !== "string" || raw.name.length === 0) return undefined;
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.angle) || !isFiniteNumber(raw.span) || !isFiniteNumber(raw.thickness)) return undefined;
  const status = STATUSES.find((entry) => entry === raw.status) ?? "default";
  return {
    id: raw.id,
    x: raw.x,
    y: raw.y,
    angle: raw.angle,
    span: raw.span,
    thickness: raw.thickness,
    name: raw.name,
    status,
    ...(typeof raw.namerId === "string" ? { namerId: raw.namerId } : {}),
    ...(isFiniteNumber(raw.revertsAt) ? { revertsAt: raw.revertsAt } : {})
  };
};

/** Applies one ISLAND_NAMES message. Returns false (state untouched) for a malformed payload. */
export const applyIslandNamesMessage = (state: IslandNamesState, msg: Record<string, unknown>): boolean => {
  if (!Array.isArray(msg.islands)) return false;
  const labels: IslandLabel[] = [];
  for (const entry of msg.islands) {
    const label = parseIslandLabel(entry);
    if (label) labels.push(label);
  }
  state.islandLabels = labels;
  return true;
};
