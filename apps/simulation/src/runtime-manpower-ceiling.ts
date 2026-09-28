import type { DomainPlayer } from "@border-empires/game-domain";

type OverflowHolder = Pick<DomainPlayer, "waystationManpowerOverflow">;

/**
 * The most manpower a player may currently hold: their manpower cap plus any
 * unspent Waystation MANPOWER overflow. Only waystation manpower is allowed
 * above the cap -- every other source (regen, refunds, cap growth) still stops
 * at the cap, so a player who loses towns doesn't keep manpower above their
 * new, lower cap unless it came from a waystation.
 */
export const manpowerCeiling = (player: OverflowHolder, cap: number): number =>
  cap + Math.max(0, player.waystationManpowerOverflow ?? 0);

/**
 * Credits returned/refunded manpower, clamped to {@link manpowerCeiling}
 * rather than the bare cap -- a bare-cap clamp would silently erase a
 * player's waystation overflow the moment any refund landed.
 */
export const creditManpower = (player: OverflowHolder & Pick<DomainPlayer, "manpower">, amount: number, cap: number): void => {
  player.manpower = Math.min(manpowerCeiling(player, cap), player.manpower + amount);
};

/**
 * Shrinks the overflow allowance to what the player still holds above the cap,
 * so spent overflow can't be regained later (by regen or a refund). Called
 * whenever manpower is settled (refreshManpowerOnlyForPlayer).
 */
export const settleWaystationManpowerOverflow = (player: OverflowHolder & Pick<DomainPlayer, "manpower">, cap: number): void => {
  if (player.waystationManpowerOverflow === undefined) return;
  const remaining = Math.max(0, Math.min(player.waystationManpowerOverflow, player.manpower - cap));
  if (remaining > 0) player.waystationManpowerOverflow = remaining;
  else delete player.waystationManpowerOverflow;
};

/** Adds `amount` manpower on top of the player's (already-settled) manpower, allowing it to exceed the cap. */
export const grantOverflowManpower = (player: OverflowHolder & Pick<DomainPlayer, "manpower">, amount: number, cap: number): void => {
  player.manpower = Math.max(0, player.manpower) + amount;
  const aboveCap = player.manpower - cap;
  if (aboveCap > 0) player.waystationManpowerOverflow = aboveCap;
};
