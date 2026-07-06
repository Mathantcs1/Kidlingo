/**
 * Detects in-app / embedded browsers (webviews) where Google OAuth is blocked
 * by Google's "Use secure browsers" policy (Error 403: disallowed_useragent).
 *
 * Google refuses to run its OAuth flow inside embedded webviews for security
 * reasons, so when a user opens a link to the app from inside another app
 * (Instagram, Facebook, Gmail, LinkedIn, an in-app activity feed, etc.) the
 * "Sign in with Google" button leads to a dead-end error page. We detect that
 * environment up front and guide the user to their real system browser.
 */
export function isInAppBrowser(userAgent?: string): boolean {
  const ua = (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")) || "";
  if (!ua) return false;

  const rules = [
    // Facebook / Messenger
    "FBAN", "FBAV", "FB_IAB", "FBIOS", "Messenger",
    // Instagram
    "Instagram",
    // Other social / messaging in-app browsers
    "Line/", "Twitter", "TwitterAndroid", "Snapchat", "LinkedInApp",
    "Pinterest", "MicroMessenger", "WhatsApp", "TikTok", "Musical_ly",
    // Google in-app surfaces (Search App / Gmail app webview)
    "GSA/",
    // Android WebView marker
    "; wv",
  ];

  if (rules.some((r) => ua.includes(r))) return true;

  // iOS: a real Safari UA contains "Safari"; embedded WKWebViews on iOS are
  // "Mobile" but omit the "Safari" token. Exclude Chrome/Firefox/Edge which
  // legitimately identify themselves and are allowed by Google.
  const isIOS = /iPhone|iPod|iPad/.test(ua);
  if (isIOS) {
    const isRealBrowser = /Safari/.test(ua) || /CriOS/.test(ua) || /FxiOS/.test(ua) || /EdgiOS/.test(ua);
    if (/Mobile/.test(ua) && !isRealBrowser) return true;
  }

  return false;
}
