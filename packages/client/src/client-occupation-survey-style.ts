// The same brass, parchment, panel and type tokens as the game HUD.
export const occupationSurveyStyles = `
  .occupation-survey-overlay {
    position: fixed; inset: 0; z-index: 34; display: grid; place-items: center;
    box-sizing: border-box; padding: 16px;
    background: rgba(12, 9, 6, .72); backdrop-filter: blur(4px);
  }
  .occupation-survey-popup {
    box-sizing: border-box; width: min(440px, 100%); max-height: calc(100dvh - 32px);
    overflow: auto; padding: 28px; border: 1px solid var(--sp-brass-700, #8a611f);
    border-radius: 6px; background: var(--sp-panel-bg, linear-gradient(175deg, #2b2015, #14100a));
    color: var(--sp-parchment-100, #f2e8d3);
    box-shadow: 0 28px 72px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(244, 223, 166, .08);
    font: 400 16px/1.6 var(--sp-font-body, "Spectral", Georgia, serif);
    text-align: left; text-transform: none; letter-spacing: normal;
  }
  .occupation-survey-kicker {
    display: block; margin-bottom: 12px; color: var(--sp-brass-300, #d9ad52);
    font: 600 11px/1.4 var(--sp-font-mono, "Space Mono", monospace);
    letter-spacing: .08em; text-transform: uppercase;
  }
  .occupation-survey-popup h2 {
    margin: 0 0 16px; color: var(--sp-brass-100, #f4dfa6);
    font: 600 24px/1.35 var(--sp-font-display, "Cinzel", Georgia, serif);
    letter-spacing: .01em;
  }
  .occupation-survey-popup p { margin: 0 0 16px; }
  .occupation-survey-popup .occupation-survey-hint {
    color: var(--sp-parchment-muted, #bda880); font-size: 14px;
  }
  .occupation-survey-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
  .occupation-survey-actions button {
    flex: 1; min-height: 44px; padding: 10px 16px;
    border: 1px solid var(--sp-brass-700, #8a611f); border-radius: 6px;
    background: rgba(60, 41, 25, .5); color: var(--sp-parchment-100, #f2e8d3);
    font: 600 15px/1.4 var(--sp-font-body, "Spectral", Georgia, serif);
    text-transform: none; letter-spacing: normal; cursor: pointer;
  }
  .occupation-survey-actions [data-survey-view] {
    background: rgba(217, 173, 82, .18); border-color: var(--sp-brass-500, #b8862f);
  }
  .occupation-survey-actions button:hover {
    background: rgba(90, 61, 32, .65); border-color: var(--sp-brass-300, #d9ad52);
  }
  .occupation-survey-actions button:focus-visible {
    outline: 2px solid var(--sp-brass-300, #d9ad52); outline-offset: 3px;
  }
  @media (max-width: 420px) { .occupation-survey-popup { padding: 20px; } }
`;
