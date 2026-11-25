// Settings → Credits: who makes the game (Playtest Run 4: a persona asked and found no answer). The studio name is the
// owner's own wording, "Wayepoint Studios" (2026-11-23).
export const CREDITS_STUDIO_NAME = "Wayepoint Studios";

export const settingsCreditsPageHtml = (): string => `
  <div class="card auth-settings-card settings-credits">
    <p class="settings-section-title">Border Empires</p>
    <p>Made by ${CREDITS_STUDIO_NAME}.</p>
    <p class="settings-field-hint">Thanks to everyone who plays, reports bugs and shares ideas on the Discord.</p>
  </div>
`;
