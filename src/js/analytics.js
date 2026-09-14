// Google Analytics 4 (gtag.js), loaded conditionally — this stays a silent
// no-op until VITE_GA_MEASUREMENT_ID is set, so local dev without a real GA
// property never breaks or spams the network tab.
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

function loadGtag() {
  if (!GA_ID) {
    console.warn('[HEWKAO] VITE_GA_MEASUREMENT_ID not set — analytics disabled.');
    return;
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

// Fire-and-forget custom event — safe to call even when analytics is disabled.
export function trackEvent(name, params = {}) {
  if (!GA_ID || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

loadGtag();
