// Wire/domain shape of a tile's muster flag, shared by game-domain (the
// authoritative tile schema), the simulation (tickMuster/maybeAdvanceFire/
// maybeMarchFire), and the client (HUD panel, tile menu, on-map alert) —
// extracted out to one place so the three copies of this shape (which had
// already drifted: the wire type here was missing capLevel that game-domain
// and the client both carried) can't silently diverge again.
export type MusterState = {
  ownerId: string;
  amount: number;
  mode: "HOLD" | "ADVANCE" | "MARCH";
  targetX?: number;
  targetY?: number;
  setAt?: number;
  updatedAt: number;
  // Number of "Expand Capacity" upgrades purchased on this flag — see
  // musterFlagCap (shared/config.ts).
  capLevel?: number;
  // ADVANCE/MARCH auto-fire status for UI feedback (see syncMusterStatus in
  // apps/simulation/src/runtime-muster-tick/muster-auto-fire-shared.ts).
  // true while an attack this flag funded is in flight; absent/undefined for
  // HOLD or whenever there's nothing meaningful to report.
  inFlight?: boolean | undefined;
  // Epoch ms of this flag's next auto-fire search attempt, when idle and
  // cooling down (not in flight). Absent for HOLD mode.
  nextActionAt?: number | undefined;
  // The enemy tile currently under attack, set alongside inFlight so the
  // client can show "Fighting at (x,y)" instead of just "Fighting".
  fightX?: number | undefined;
  fightY?: number | undefined;
};
