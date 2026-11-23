/**
 * Encirclement for settled tiles a player's action unsettles.
 *
 * When a rival's reach overtakes a SETTLED tile (settleOvertaken in
 * runtime-reach-border-apply.ts) the tile drops to FRONTIER but keeps its
 * owner. Capturing a town does this to the loser's settled land around it --
 * once at the capture (the loser's town anchor drops, and reach the captor
 * already had takes the slots) and again when the captured town finishes
 * settling (its own reach switches on; a captured town lands FRONTIER and
 * only anchors once SETTLED). Nothing checked those tiles for supply, so a
 * tile wrapped in the captor's land stayed the loser's FRONTIER inside the
 * captor's lines.
 *
 * The runtime runs each lock resolution (attacker) and each settlement
 * completion (settler) inside `scope`, naming the player acting in it -- not
 * the defender: a defender wiped out mid-fight respawns inside the
 * resolution, and its new AFC's reach must not claim the attacker's land. The unsettle hook `record`s every
 * downgrade with the tile's owner and the overtaking player; when the scope
 * ends, each owner's tiles overtaken by one of those players are checked, with
 * that player as claimant: a cut-off tile touching the claimant's land goes to
 * them (encirclement-pocket-capture.ts), any other cut-off tile goes neutral.
 *
 * A capture whose town was the only anchor over the loser's land around it
 * vacates the border there instead; those tiles drop at once and are charged
 * to the acting player. Outside a scope nothing is recorded: the boot-time reach replay, AFC
 * landings and respawns and structure builds also unsettle tiles, and handing
 * a player's land to whoever's reach grew over it there is not a rule of the
 * game. Overtakes by a player not acting in the scope (a third party whose
 * reach the capture uncovered) are ignored too.
 */

export type UnsettleEncirclementContext = {
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string, options: { claimantId: string }) => void;
};

type Frame = {
  /** The player whose action this is (attacker, settler): claimant for a vacated border. */
  actorId: string | undefined;
  participants: ReadonlySet<string>;
  commandId: string;
  // `${claimantId}\n${ownerId}` -> unsettled tile keys; bounded by tiles one action unsettles.
  byPair: Map<string, string[]>;
};

export const createUnsettleEncirclementScope = (context: UnsettleEncirclementContext) => {
  const frames: Frame[] = [];

  const drain = (frame: Frame): void => {
    for (const [pair, tileKeys] of frame.byPair) {
      const [claimantId, ownerId] = pair.split("\n") as [string, string];
      context.applyEncirclement(tileKeys, ownerId, frame.commandId, { claimantId });
    }
  };

  /**
   * Runs `apply` (one player action), then checks the tiles it unsettled.
   * Scopes nest: each one only drains what was recorded while it was the
   * innermost.
   */
  const scope = (participants: readonly (string | undefined)[], commandId: string, apply: () => void): void => {
    const frame: Frame = { actorId: participants[0], participants: new Set(participants.filter((id): id is string => Boolean(id))), commandId, byPair: new Map() };
    frames.push(frame);
    try {
      apply();
    } finally {
      frames.pop();
    }
    drain(frame);
  };

  /**
   * Notes that `ownerId`'s settled `tileKey` was just downgraded to FRONTIER
   * because `overtakerId`'s reach took it ("" when the border was vacated:
   * e.g. a captured town was the only anchor over the loser's land around
   * it -- that loss is the acting player's doing, so they are the claimant).
   * `ownerId` must be read before the downgrade runs its hooks.
   */
  const record = (tileKey: string, ownerId: string | undefined, overtakerId: string): void => {
    const frame = frames[frames.length - 1];
    const claimantId = overtakerId || frame?.actorId;
    if (!frame || !ownerId || !claimantId || ownerId === claimantId) return;
    if (ownerId.startsWith("barbarian-") || !frame.participants.has(claimantId)) return;
    const pair = `${claimantId}\n${ownerId}`;
    const keys = frame.byPair.get(pair);
    if (keys) keys.push(tileKey);
    else frame.byPair.set(pair, [tileKey]);
  };

  /**
   * The runtime's unsettle hook: reads the owner, runs the downgrade, then
   * records it (the downgrade's own hooks may rewrite the tile).
   */
  const downgrade = (tileKey: string, ownerBefore: string | undefined, overtakerId: string, applyDowngrade: () => void): void => {
    applyDowngrade();
    record(tileKey, ownerBefore, overtakerId);
  };

  return { scope, record, downgrade };
};
