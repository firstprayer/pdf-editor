// Google Analytics 4 for the public site only.
//
// Privacy rules (documents never leave the browser; analytics must not change that):
// - Loads only on the production host and path, never on localhost or previews.
// - Page locations drop query strings and fragments; referrers keep the origin only.
// - Events carry counts and tool names only: never file names, document text,
//   signatures, images or error messages.
// - Google signals and ad personalization are disabled.
// Blocking the script (ad blockers, privacy settings) never affects editing.

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || "";
const PRODUCTION_HOST = "firstprayer.github.io";

let enabled = false;

function productionPage() {
  return (
    location.hostname === PRODUCTION_HOST && location.pathname.startsWith(import.meta.env.BASE_URL)
  );
}

export function initAnalytics() {
  if (enabled || !/^G-[A-Z0-9]+$/.test(MEASUREMENT_ID) || !productionPage()) return;
  enabled = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  let referrer = "";
  try {
    referrer = new URL(document.referrer).origin;
  } catch {
    // Direct visits have no referrer.
  }
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    page_location: location.origin + location.pathname,
    page_referrer: referrer,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.append(script);
}

const ALLOWED_PARAMS = new Set(["tool", "pages", "edits", "files", "redacted", "method"]);

export function track(name, params = {}) {
  if (!enabled) return;
  const safe = {};
  for (const [key, value] of Object.entries(params)) {
    if (ALLOWED_PARAMS.has(key) && ["number", "boolean", "string"].includes(typeof value)) {
      safe[key] = typeof value === "string" ? value.slice(0, 40) : value;
    }
  }
  window.gtag("event", name, safe);
}
