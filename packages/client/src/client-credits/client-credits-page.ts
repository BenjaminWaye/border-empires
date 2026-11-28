// Settings → Credits: who makes the game (Playtest Run 4: a persona asked and found no answer).
// Owner wording (2026-11-28): the creator is named, and the studio is "Waypoint Studios"
// (it was misspelt "Wayepoint" until then).
export const CREDITS_CREATOR_NAME = "Benjamin Waye";
export const CREDITS_STUDIO_NAME = "Waypoint Studios";

export const settingsCreditsPageHtml = (): string => `
  <div class="card auth-settings-card settings-credits">
    <p class="settings-section-title">Border Empires</p>
    <p>Created by ${CREDITS_CREATOR_NAME}.</p>
    <p>Made by ${CREDITS_STUDIO_NAME}.</p>
    <p class="settings-field-hint">Thanks to everyone who plays, reports bugs and shares ideas on the Discord.</p>
  </div>
`;
