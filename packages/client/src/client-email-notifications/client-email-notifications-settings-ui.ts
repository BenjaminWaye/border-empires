// The "Email Notifications" settings sub-page: one checkbox per gameplay
// email category the gateway can send (email-alerts.ts), mirroring
// client-audio-settings-ui.ts's field-builder + binder split. Every category
// defaults to on, matching the server's opt-out model.
import {
  getEmailNotificationPrefs,
  setEmailNotificationPref,
  type EmailNotificationCategory
} from "./client-email-notification-prefs-storage.js";

const CATEGORY_LABELS: Array<{ id: EmailNotificationCategory; title: string; desc: string }> = [
  { id: "allianceRequest", title: "Alliance Requests", desc: "Someone offers your empire an alliance" },
  { id: "allianceBreak", title: "Alliance Breaks", desc: "An ally starts breaking their alliance with you" },
  { id: "truceOffer", title: "Truce Offers", desc: "Someone offers your empire a truce" },
  { id: "attackAlert", title: "Attacks", desc: "Your empire is attacked" },
  { id: "aetherPurgeAlert", title: "Aether Purges", desc: "Your empire is hit with an Aether Purge" },
  { id: "seasonStart", title: "New Season", desc: "A new season begins" },
  { id: "manpowerFull", title: "Manpower Full", desc: "Your manpower reaches its cap while you're away" }
];

export const emailNotificationsSettingsPageHtml = (): string => {
  const prefs = getEmailNotificationPrefs();
  return `
    <div class="card auth-settings-card settings-email-notifications">
      <p>Choose which gameplay emails Border Empires can send to your account's email address.</p>
      ${CATEGORY_LABELS.map(
        (category) => `
      <div class="settings-email-notification-field">
        <label>
          <div class="row settings-email-notification-row">
            <input type="checkbox" data-settings-email-notification="${category.id}" ${prefs[category.id] ? "checked" : ""} />
            <div>
              <p>${category.title}</p>
              <p class="settings-email-notification-desc">${category.desc}</p>
            </div>
          </div>
        </label>
      </div>`
      ).join("")}
    </div>
  `;
};

/** Binds the checkboxes rendered by emailNotificationsSettingsPageHtml() within `root`. */
export const bindEmailNotificationsSettingsControls = (root: ParentNode): void => {
  (root.querySelectorAll("[data-settings-email-notification]") as NodeListOf<HTMLInputElement>).forEach((input) => {
    input.onchange = () => {
      const category = input.dataset.settingsEmailNotification as EmailNotificationCategory | undefined;
      if (!category) return;
      setEmailNotificationPref(category, input.checked);
    };
  });
};
