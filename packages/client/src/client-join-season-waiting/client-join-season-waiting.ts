// The waiting view of the join card. "Wait for the next contest" used to
// close the card and leave the player on an empty, fogged map with no word of
// what happens next. It now switches the card to this view: the Sector
// Contests running now (with "Fund a new sector" always offered where funding
// is), a way to be emailed when the next contest starts, and Land now in case
// the player changes their mind. The close button still leaves for the map.
//
// The email is the existing New Sector Contest email (season-start-notify.ts
// on the gateway), sent to every account with an email address and the
// seasonStart preference on. So the button only turns that preference on;
// a guest is sent to save their empire first, and an account with no email
// address is told so.

export type WaitingEmailStatus = "on" | "off" | "guest" | "no-email";

export type WaitingEmailInput = { authIsGuest: boolean; authEmail: string; seasonStartEmailOn: boolean };

export const waitingEmailStatus = ({ authIsGuest, authEmail, seasonStartEmailOn }: WaitingEmailInput): WaitingEmailStatus => {
  if (authIsGuest) return "guest";
  if (!authEmail.trim()) return "no-email";
  return seasonStartEmailOn ? "on" : "off";
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const waitingEmailHtml = (status: WaitingEmailStatus, authEmail: string): string => {
  if (status === "on") return `<p class="respawn-summary" data-join-waiting-email="on">We'll email <strong>${escapeHtml(authEmail.trim())}</strong> when the next Sector Contest starts.</p>`;
  if (status === "off") return `<button id="join-waiting-email" class="panel-btn" type="button">Email me when the next contest starts</button>`;
  if (status === "guest") return `<button id="join-waiting-save" class="panel-btn" type="button">Save your empire to get an email</button>`;
  return `<p class="respawn-summary" data-join-waiting-email="none">Your sign-in has no email address, so we can't email you.</p>`;
};

export type JoinWaitingHtmlInput = { emailHtml: string; sectorListHtml: string; landDisabled: boolean };

export const joinWaitingHtml = ({ emailHtml, sectorListHtml, landDisabled }: JoinWaitingHtmlInput): string => `
    <div class="respawn-backdrop" id="join-season-backdrop"></div>
    <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
      <button id="join-season-close" class="guide-close-btn" type="button" aria-label="Close">×</button>
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">Sector Contest</div>
        <h2 id="join-season-title" class="respawn-title">Waiting for the next contest</h2>
        <section class="respawn-section respawn-actions">
          ${emailHtml}
          <button id="join-season-confirm" class="panel-btn" type="button" ${landDisabled ? "disabled" : ""}>${landDisabled ? "This sector is full" : "Land now instead"}</button>
        </section>
        ${sectorListHtml}
      </div>
    </div>
  `;
