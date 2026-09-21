// Maximum number of actions one ADVANCE/MARCH flag may have committed at
// once. A flag can launch another action as soon as the prior action starts
// its travel/claim/combat timer, while this cap prevents a single flag from
// flooding the lock table.
export const MUSTER_MAX_CONCURRENT_ACTIONS = 3;
