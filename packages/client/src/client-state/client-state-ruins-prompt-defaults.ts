/**
 * Whether the "empire in ruins" popup (client-ruins-prompt.ts) is currently on
 * screen. Set/cleared by that module so isMapUnobstructed can see it -- the
 * popup mounts itself on document.body and otherwise keeps no shared state.
 * Extracted out of client-state.ts (already over the file-line cap).
 */
export const createInitialRuinsPromptState = () => ({ ruinsPromptOpen: false });
