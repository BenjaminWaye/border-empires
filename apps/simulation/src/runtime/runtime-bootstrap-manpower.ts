import type { RuntimePlayer } from "../runtime-types.js";

/** Settle the recovered roster after tile indexes and town ordering are restored. */
export function settleBootstrapManpower(players: Iterable<RuntimePlayer>, settle: (player: RuntimePlayer) => void): number {
  // The constructor calls this only after ancillary depots, neural works,
  // reserve lattices and ancillary factories have been indexed from recovered
  // tiles. The first manpower-cap read must see those structures: settling
  // immediately after loading players used to clamp manpower down at boot,
  // then refill it on the player's next tile mutation.
  let restamped = 0;
  for (const player of players) {
    const previousCapSnapshot = player.manpowerCapSnapshot;
    settle(player);
    // Counter (see manpowerCapBootstrapRestampedCount's declaration): a
    // recovered player whose persisted manpowerCapSnapshot doesn't match
    // what boot hydration just computed. Expected to fire roughly
    // once per structure-owning player per restart (their old snapshot
    // predates this boot's tile hydration) and settle back to 0 — a count
    // that keeps climbing during steady-state, not just at startup, means
    // this guard itself has regressed.
    if (Number.isFinite(previousCapSnapshot) && previousCapSnapshot !== player.manpowerCapSnapshot) {
      restamped += 1;
    }
  }
  return restamped;
}
