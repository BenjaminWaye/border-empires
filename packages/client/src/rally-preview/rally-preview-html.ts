export const RALLY_PREVIEW_IMAGE_PATH = "/og/rally-preview.jpg";

export type RallyPreviewInput = {
  origin: string;
  code: string;
  ownerName?: string | undefined;
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

// ownerName is a player-chosen display name rendered into a page other people's link unfurlers read.
const sanitizeOwnerName = (value: string | undefined): string | undefined => {
  const cleaned = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return cleaned.length > 0 ? cleaned : undefined;
};

export const rallyPreviewCopy = (ownerName: string | undefined): { title: string; description: string } => {
  const owner = sanitizeOwnerName(ownerName);
  if (!owner) {
    return {
      title: "Border Empires",
      description: "Claim territory, build an empire and fight for the map in Border Empires."
    };
  }
  return {
    title: `${owner} needs you in Border Empires`,
    description: `${owner} is holding the line and wants you next to them. Join their rally and start beside ${owner}.`
  };
};

export const buildRallyPreviewHead = (input: RallyPreviewInput): string => {
  const { title, description } = rallyPreviewCopy(input.ownerName);
  const origin = input.origin.replace(/\/$/, "");
  const url = `${origin}/r/${encodeURIComponent(input.code)}`;
  const image = `${origin}${RALLY_PREVIEW_IMAGE_PATH}`;
  const tags: Array<[string, string, string]> = [
    ["name", "description", description],
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Border Empires"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", url],
    ["property", "og:image", image],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", title],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image]
  ];
  return [
    `<title>${escapeHtml(title)}</title>`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`)
  ].join("\n    ");
};

// Replaces the app shell's own <title> and adds the preview tags; returns the html untouched when there is no
// </head> to anchor on, so a shell change can never turn into a broken page.
export const injectRallyPreview = (html: string, input: RallyPreviewInput): string => {
  if (!/<\/head>/i.test(html)) return html;
  const withoutTitle = html.replace(/<title>[\s\S]*?<\/title>\s*/i, "");
  return withoutTitle.replace(/<\/head>/i, () => `    ${buildRallyPreviewHead(input)}\n  </head>`);
};
