/**
 * Cosmetic reaction to a battle the attacker's Siege Battery/Tower/Dread
 * Tower is close enough to bombard — see
 * client-battle-overlay/client-siege-bombardment.ts. Extracted out of
 * client-state.ts (already at the file-line cap) so new fields don't grow
 * that file.
 *
 * siegeAimOverrides is keyed by the battery's own tile key and holds at
 * most one target: a battery in range of two battles simply retargets to
 * whichever registered most recently, rather than trying to reserve one
 * battery per battle (see client-siege-bombardment.ts for the rationale).
 */
export const createInitialSiegeBombardmentState = () => ({
  siegeAimOverrides: new Map<string, { targetX: number; targetY: number; expiresAt: number }>(),
  siegeBombardFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>
});
