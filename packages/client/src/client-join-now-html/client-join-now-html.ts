// The join card for a running Sector Contest (client-join-season-overlay.ts).
// GDD §6: before landing, the player sees the contest day, the manpower they
// land with and that difficulty is high (warningHtml), and chooses to land
// now or wait for the next contest (waitButtonHtml). While the join is in
// flight the card only shows the spinner and wait hint. The close button
// keeps the HUD reachable.
// sectorListHtml: the running Sector Contests (client-sector-list/); landDisabled
// when this one is full, so Land now cannot be pressed.
export type JoinNowHtmlInput = { joining: boolean; waitHintHtml: string; warningHtml?: string; waitButtonHtml?: string; sectorListHtml?: string; landDisabled?: boolean };

export const joinNowHtml = ({ joining, waitHintHtml, warningHtml = "", waitButtonHtml = "", sectorListHtml = "", landDisabled = false }: JoinNowHtmlInput): string => {
  const buttonLabel = joining ? '<span class="season-lobby-join-spinner" aria-hidden="true"></span>Joining... setting up your empire' : landDisabled ? "This sector is full" : "Land now";
  const disabled = joining ? 'disabled aria-busy="true"' : landDisabled ? "disabled" : "";
  return `
    <div class="respawn-backdrop" id="join-season-backdrop"></div>
    <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
      ${joining ? "" : '<button id="join-season-close" class="guide-close-btn" type="button" aria-label="Close">×</button>'}
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">Sector Contest</div>
        <h2 id="join-season-title" class="respawn-title">${joining ? "Entering the Sector" : "Sector open"}</h2>
        ${joining ? "" : warningHtml}
        <section class="respawn-section respawn-actions">
          <button id="join-season-confirm" class="panel-btn season-lobby-lets-go-btn${joining ? " is-joining" : ""}" type="button" ${disabled}>${buttonLabel}</button>
          ${joining ? "" : waitButtonHtml}
          ${waitHintHtml}
        </section>
        ${joining ? "" : sectorListHtml}
      </div>
    </div>
  `;
};
