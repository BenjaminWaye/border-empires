/** How long a called-down AFC module is in transit before it docks. */
export const AFC_MODULE_CALL_DOWN_MS = 60_000;

/** Module slots per AFC (docked + in transit). More modules need another AFC. */
export const AFC_MODULE_SLOTS = 8;

/** Build AFC is offered (on empty land) once one of your AFCs has at least this many modules docked. */
export const AFC_BUILD_MIN_MODULES = 6;
