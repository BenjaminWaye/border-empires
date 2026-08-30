// iOS Safari (and any other WebKit browser on iOS — Chrome/Firefox on iOS are
// required by Apple to embed WebKit, so they inherit the same WebContent
// process and the same per-tab memory ceiling) is reported to enforce a
// roughly 300-500MB budget on WebGL content — far tighter than desktop or
// Android Chrome, and tighter than the renderer's default configuration
// assumes. See client-map-3d-quality-tier.ts for what reads this.
//
// Matched on "iPhone" or "iPad" rather than "Safari" specifically: the WebKit
// requirement means the ceiling applies regardless of which browser chrome
// the user picked, so keying off "Safari" alone would miss Chrome-on-iOS and
// treat it as if it had Android's more permissive limits.
//
// iPadOS 13+ reports a Mac-like desktop user agent by default (Apple's
// "Request Desktop Website" default for tablets), so it is not caught by this
// check and gets treated as desktop. That is a deliberate gap, not an
// oversight: an iPad's larger screen and higher memory ceiling make the
// desktop assumption closer to correct than treating it as an iPhone, and the
// crash-breadcrumb ladder still catches an iPad that turns out to need it.
export const isIOSSafari = (userAgent: string): boolean => /iPhone|iPod/.test(userAgent);
