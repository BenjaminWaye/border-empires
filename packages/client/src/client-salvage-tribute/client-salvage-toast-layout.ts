import type { SalvageToast } from "./client-salvage-ready-toasts.js";

/** Below this on-screen tile size (CSS px) a toast shrinks to a small count pip. */
export const SALVAGE_PIP_TILE_PX = 32;

/** Centre-to-centre distance (CSS px) under which two markers would overlap, per mode: about one
 * marker width/height ("Salvage 10" at 11px is ~78px wide), plus a little breathing room. */
const OVERLAP = { pip: { x: 24, y: 24 }, label: { x: 88, y: 26 } } as const;

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
  type Cluster = { members: PlacedSalvageToast[]; x: number; y: number };
  const clusters: Cluster[] = placed.map(entry => ({ members: [entry], x: entry.x, y: entry.y }));
  // Merge until no two markers overlap: a moved centre can come within reach of another cluster.
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < clusters.length && !merged; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i]!, b = clusters[j]!;
        if (Math.abs(a.x - b.x) >= reachX || Math.abs(a.y - b.y) >= reachY) continue;
        const n = a.members.length + b.members.length;
        a.x = (a.x * a.members.length + b.x * b.members.length) / n;
        a.y = Math.min(a.y, b.y);
        a.members.push(...b.members);
        clusters.splice(j, 1);
        merged = true;
        break;
      }
    }
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
