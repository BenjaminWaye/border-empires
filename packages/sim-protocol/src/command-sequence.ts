/** Internal social commands have durable IDs and deliberately reuse sequence zero. */
export const IDENTITY_ONLY_COMMAND_TYPES = ["SYNC_TRUCE", "SYNC_ALLIANCE", "SETTLE_DIPLOMACY_TERMS", "CANCEL_RESOURCE_SUPPLY"] as const;
export const usesPlayerCommandSequence = (type: string): boolean =>
  !IDENTITY_ONLY_COMMAND_TYPES.some(value => value === type);
/** Shared by the gateway and simulation schema owners and their lookups. */
export const CLIENT_SEQUENCE_SQL_PREDICATE =
  `command_type NOT IN (${IDENTITY_ONLY_COMMAND_TYPES.map(type => `'${type}'`).join(", ")})`;
export const clientSequenceIndexNeedsMigration = (sql: string): boolean =>
  !/\bwhere\b/i.test(sql) || IDENTITY_ONLY_COMMAND_TYPES.some(type => !sql.includes(`'${type}'`));
/**
 * Command-id prefix of the gateway's deal/gift payments (SETTLE_DIPLOMACY_TERMS,
 * CANCEL_RESOURCE_SUPPLY). The gateway awaits their verdict, so the simulation
 * streams it even when the command's player (often an AI) has no subscriber.
 */
export const DIPLOMACY_SETTLEMENT_COMMAND_PREFIX = "diplomacy-settle:";
