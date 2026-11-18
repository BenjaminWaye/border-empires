import { escapeHtml } from "./escape-html.js";

// The branded HTML/text layout shared by every gameplay email, extracted from
// email-alerts.ts so the service file stays focused on send policy.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  // Extra SMTP headers (List-Unsubscribe / List-Unsubscribe-Post).
  headers?: Record<string, string>;
};

/** Who the email goes to, plus that recipient's signed unsubscribe link (absent when no signing secret is configured). */
export type EmailRecipient = { to: string; unsubscribeUrl?: string };

export type BrandedEmailInput = EmailRecipient & {
  subject: string;
  eyebrow: string;
  headline: string;
  body: string[];
  highlight?: { label: string; value: string };
  linkUrl?: string;
  linkLabel?: string;
  // A quieter text link under the main button (e.g. "View the last contest's recap").
  secondaryLink?: { url: string; label: string };
};

// RFC 2369 + RFC 8058: lets mail apps show their own "Unsubscribe" control,
// which does a one-click POST to the same signed URL.
export const unsubscribeHeaders = (unsubscribeUrl: string): Record<string, string> => ({
  "List-Unsubscribe": `<${unsubscribeUrl}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
});

export const formatBrandedEmail = (appUrl: string, input: BrandedEmailInput): EmailMessage => {
  const linkUrl = input.linkUrl ?? appUrl;
  const linkLabel = input.linkLabel ?? "Enter Border Empires";
  const safeHeadline = escapeHtml(input.headline);
  const safeEyebrow = escapeHtml(input.eyebrow);
  const safeBody = input.body.map(escapeHtml);
  const safeLinkUrl = escapeHtml(linkUrl);
  const safeLinkLabel = escapeHtml(linkLabel);

  const highlightHtml = input.highlight
    ? `<tr><td style="padding:24px 40px 0;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#241a08,#2f2107);border:1px solid #a9791f;border-radius:10px;">
           <tr>
             <td style="padding:20px 24px;text-align:center;">
               <div style="font:600 11px/1.4 'Segoe UI',Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#e0b84a;">${escapeHtml(input.highlight.label)}</div>
               <div style="font:700 22px/1.4 Georgia,'Times New Roman',serif;color:#fbe7ad;margin-top:6px;">${escapeHtml(input.highlight.value)}</div>
             </td>
           </tr>
         </table>
       </td></tr>`
    : "";

  const bodyHtml = safeBody.map((line) => `<p style="margin:0 0 14px;font:400 15px/1.6 'Segoe UI',Arial,sans-serif;color:#cbd2de;">${line}</p>`).join("");

  const secondaryLinkHtml = input.secondaryLink
    ? `<div style="margin-top:18px;"><a href="${escapeHtml(input.secondaryLink.url)}" style="font:600 14px/1.4 'Segoe UI',Arial,sans-serif;color:#e0b84a;text-decoration:underline;">${escapeHtml(input.secondaryLink.label)}</a></div>`
    : "";

  const unsubscribeHtml = input.unsubscribeUrl
    ? `<div style="font:400 12px/1.5 'Segoe UI',Arial,sans-serif;color:#5b647f;margin-top:8px;"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#7c8bb3;text-decoration:underline;">Unsubscribe</a> &middot; or manage emails in Settings &rarr; Email Notifications</div>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0d14;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d14;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#141826;border-radius:14px;overflow:hidden;border:1px solid #262c40;">
            <tr>
              <td style="background:linear-gradient(135deg,#1c2438,#0e1220);padding:32px 40px 24px;text-align:center;border-bottom:1px solid #2a3350;">
                <div style="font:600 12px/1 'Segoe UI',Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#7c8bb3;">${safeEyebrow}</div>
                <div style="font:700 26px/1.3 Georgia,'Times New Roman',serif;color:#f3d98b;margin-top:10px;">${safeHeadline}</div>
              </td>
            </tr>
            ${highlightHtml}
            <tr>
              <td style="padding:28px 40px 8px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 36px;text-align:center;">
                <a href="${safeLinkUrl}" style="display:inline-block;padding:14px 32px;background:#c8952f;color:#1a1305;font:700 14px/1 'Segoe UI',Arial,sans-serif;letter-spacing:0.5px;text-decoration:none;border-radius:8px;">${safeLinkLabel}</a>${secondaryLinkHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px 28px;border-top:1px solid #232a3f;text-align:center;">
                <div style="font:400 12px/1.5 'Segoe UI',Arial,sans-serif;color:#5b647f;">Border Empires &mdash; build, ally, conquer.</div>${unsubscribeHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textParts = [
    input.headline,
    input.body.join("\n\n"),
    ...(input.highlight ? [`${input.highlight.label}: ${input.highlight.value}`] : []),
    `${linkLabel}: ${linkUrl}`,
    ...(input.secondaryLink ? [`${input.secondaryLink.label}: ${input.secondaryLink.url}`] : []),
    ...(input.unsubscribeUrl ? [`Unsubscribe: ${input.unsubscribeUrl}`] : [])
  ];

  return {
    to: input.to,
    subject: input.subject,
    text: textParts.join("\n\n"),
    html,
    ...(input.unsubscribeUrl ? { headers: unsubscribeHeaders(input.unsubscribeUrl) } : {})
  };
};
