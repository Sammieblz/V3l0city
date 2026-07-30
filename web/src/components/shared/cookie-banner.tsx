"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const consentKey = "v3l0city-cookie-consent";
export type CookieConsent = "necessary" | "analytics";

export function readConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(consentKey);
  return value === "necessary" || value === "analytics" ? value : null;
}

export function setConsent(consent: CookieConsent) {
  window.localStorage.setItem(consentKey, consent);
  window.dispatchEvent(new Event("v3l0city-consent"));
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(!readConsent()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <aside className="cookie-banner" aria-label="Cookie preferences">
      <div><strong>Your privacy choices</strong><p>We use necessary storage for sign-in and preferences. Optional analytics stay off unless you choose to allow them. <Link href="/cookies">Learn about cookies.</Link></p></div>
      <div className="button-row"><button className="button button-secondary button-small" onClick={() => { setConsent("necessary"); setVisible(false); }}>Necessary only</button><button className="button button-primary button-small" onClick={() => { setConsent("analytics"); setVisible(false); }}>Allow analytics</button></div>
    </aside>
  );
}
