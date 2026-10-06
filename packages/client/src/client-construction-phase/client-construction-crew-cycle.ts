import type { ConstructionDirection } from "./client-construction-phase.js";

// The crew's repeating walk, shared by the 3D crew layer and the 2D renderer so
// both show the same behaviour (docs/construction-animation-plan.md). One clock
// per site: every figure at a site is in the same leg at the same moment, which
// is the point -- they are bodies of one AI, not independent workers.
const WALK_MS = 2000;
const PICK_MS = 900;
const WORK_MS = 2400;
export const CREW_CYCLE_MS = 2 * WALK_MS + PICK_MS + WORK_MS;

export type CrewCycleState = {
  // 0 = at the parts stack, 1 = at the structure.
  readonly along: number;
  readonly carrying: boolean;
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

// `seed01` (0..1) offsets the cycle per site so neighbouring sites are not in
// unison with each other, only within themselves.
export const crewCycleState = (nowMs: number, seed01: number, direction: ConstructionDirection, stalled: boolean): CrewCycleState => {
  const building = direction === "build";
  if (stalled) return { along: building ? 1 : 0, carrying: false };
  const t = (nowMs + seed01 * CREW_CYCLE_MS) % CREW_CYCLE_MS;
  // Leg 0: carry a part (stack -> structure when building, structure -> stack
  // when removing). Leg 1: work/pack pause. Leg 2: walk back empty. Leg 3: pick up.
  let toward = 0;
  let carrying = false;
  if (t < WALK_MS) {
    toward = smooth(t / WALK_MS);
    carrying = true;
  } else if (t < WALK_MS + WORK_MS) {
    toward = 1;
  } else if (t < 2 * WALK_MS + WORK_MS) {
    toward = 1 - smooth((t - WALK_MS - WORK_MS) / WALK_MS);
  }
  return { along: building ? toward : 1 - toward, carrying };
};

// Stable 0..1 per-site seed from world tile coordinates (no `three` import, so
// the 2D renderer can use it too).
export const crewSeed01 = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393);
  h = Math.imul(h + (y | 0), -1640531535);
  h = Math.imul(h ^ (h >>> 15), -2048144789);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967295;
};
