import type { SalvageToast } from "./client-salvage-ready-toasts.js";

/** Below this on-screen tile size (CSS px) a toast shrinks to a small count pip. */
export const SALVAGE_PIP_TILE_PX = 32;

/** Half-extents (CSS px) within which two toasts would overlap, per mode. */
const OVERLAP = { pip: { x: 22, y: 22 }, label: { x: 64, y: 26 } } as const;

export type SalvageToastMode = keyof typeof OVERLAP;

export interface PlacedSalvageToast { readonly toast: SalvageToast; readonly x: number; readonly y: number }

export interface SalvageToastGroup {
  /** Stable DOM key: the group's first member. */
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly loads: number;
  readonly fields: number;
  readonly ready: boolean;
  /** The field a tap opens: the first one that can ship now, else the first. */
  readonly target: SalvageToast;
}

export const salvageToastModeFor = (tilePx: number): SalvageToastMode => tilePx < SALVAGE_PIP_TILE_PX ? "pip" : "label";

/** Merges toasts that would overlap on screen into one, so a deposit of Works shows a single marker. */
export function groupSalvageToasts(placed: readonly PlacedSalvageToast[], mode: SalvageToastMode): SalvageToastGroup[] {
  const { x: reachX, y: reachY } = OVERLAP[mode];
  const clusters: { members: PlacedSalvageToast[]; x: number; y: number }[] = [];
  for (const entry of placed) {
    const near = clusters.find(c => Math.abs(c.x - entry.x) < reachX && Math.abs(c.y - entry.y) < reachY);
    if (!near) { clusters.push({ members: [entry], x: entry.x, y: entry.y }); continue; }
    near.members.push(entry);
    near.x = near.members.reduce((sum, m) => sum + m.x, 0) / near.members.length;
    near.y = Math.min(near.y, entry.y);
  }
  return clusters.map(({ members, x, y }) => {
    const ready = members.some(m => m.toast.ready);
    return {
      key: members[0]!.toast.key,
      x, y,
      loads: members.reduce((sum, m) => sum + m.toast.loads, 0),
      fields: members.length,
      ready,
      target: (members.find(m => m.toast.ready) ?? members[0]!).toast
    };
  });
}

export const salvageToastText = (group: SalvageToastGroup, mode: SalvageToastMode): string =>
  mode === "pip" ? `${group.loads}` : `Salvage ${group.loads}`;

export const salvageToastLabel = (group: SalvageToastGroup): string => {
  const { x, y } = group.target;
  const where = group.fields > 1 ? `${group.fields} salvage fields near ${x}, ${y}` : `Salvage at ${x}, ${y}`;
  return `${where}: ${group.loads} load${group.loads === 1 ? "" : "s"}${group.ready ? ". Ship to the Court" : ""}`;
};
