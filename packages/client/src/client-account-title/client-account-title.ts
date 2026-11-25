import { isAccountTitle } from "@border-empires/shared";

// An account's paid title (packages/shared/src/cosmetics/cosmetics.ts,
// accountTitleFor), shown before its House name on the contest roster and the
// public House profile. Only titles the client knows are drawn, so an
// unexpected string from the wire never reaches the page.

/** "Count" ahead of an already-escaped name, or the name alone. */
export const titledNameHtml = (escapedName: string, title: unknown): string =>
  isAccountTitle(title) ? `<span class="account-title">${title}</span> ${escapedName}` : escapedName;
