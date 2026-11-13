// The join card shown while a running Sector Contest is joined automatically
// (client-join-season-overlay.ts). It replaced the "Choose your Sector" board:
// players opening the game want to play, so the card only covers the seconds
// the join takes. The Play button is the fallback for a join that could not
// be sent or came back without a spawn.
export type JoinNowHtmlInput = { joining: boolean; waitHintHtml: string };

export const joinNowHtml = ({ joining, waitHintHtml }: JoinNowHtmlInput): string => {
  const buttonLabel = joining ? '<span class="season-lobby-join-spinner" aria-hidden="true"></span>Joining... setting up your empire' : "Play";
  const disabled = joining ? 'disabled aria-busy="true"' : "";
  return `
    <div class="respawn-backdrop" id="join-season-backdrop"></div>
    <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">Sector Contest</div>
        <h2 id="join-season-title" class="respawn-title">${joining ? "Entering the Sector" : "Sector open"}</h2>
        <section class="respawn-section respawn-actions">
          <button id="join-season-confirm" class="panel-btn season-lobby-lets-go-btn${joining ? " is-joining" : ""}" type="button" ${disabled}>${buttonLabel}</button>
          ${waitHintHtml}
        </section>
      </div>
    </div>
  `;
};
