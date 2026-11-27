// One HTML escape for the House crest code (emblems, the crest picker, the
// profile emblem, the edit dialog's preview and the map's crest SVGs). Safe in
// text and in double- or single-quoted attributes, including colour values.
export const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
