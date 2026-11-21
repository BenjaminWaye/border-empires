// Small line icons for the scout drone's HUD (dock, flight pill, landing report). Simple shapes that
// read at 16-24px, drawn in currentColor (project icon rule: "think emoji").

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/**
 * The drone seen from the front: a body with a lens, two arms and a rotor blade on each. The first
 * icon (a top-down X with four rotor circles) was read as the Mac command key (player review 2026-11-21).
 */
export const SCOUT_DRONE_ICON = svg(
  `<path d="M2.5 7h6M15.5 7h6"/><path d="M5.5 7v3h13V7"/><rect x="8" y="10" width="8" height="6" rx="2.5" fill="currentColor" stroke="none"/><circle cx="12" cy="13" r="1.4" fill="#0b1720" stroke="none"/><path d="M9.5 16l-1.5 3M14.5 16l1.5 3"/>`
);

/** One icon per kind of find in a scout report (client-scout-drone-hud.ts). */
export const SCOUT_FIND_ICONS = {
  explored: svg(`<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>`),
  town: svg(`<path d="M4 20V10l4-3 4 3v10M12 20v-7l4-3 4 3v7M3 20h18"/><path d="M8 20v-3M16 20v-3"/>`),
  dock: svg(`<circle cx="12" cy="5" r="2"/><path d="M12 7v13M8 11h8M5 14a7 7 0 0 0 14 0"/>`),
  waystation: svg(`<path d="M9 21V8M15 21V8M7 8h10M8 5h8M6 21h12"/>`),
  watchtower: svg(`<path d="M8 21l1-12h6l1 12M7 9h10M9 9V5h6v4M6 21h12"/>`),
  resource: svg(`<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M12 20L9 9l3-5 3 5z"/>`),
  empire: svg(`<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>`),
  defense: svg(`<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>`)
} as const;

export type ScoutFindKind = keyof typeof SCOUT_FIND_ICONS;
