"use client";

import { Analytics } from "@vercel/analytics/react";
import { useEffect, useState } from "react";

import { readConsent } from "@/components/shared/cookie-banner";

export function AnalyticsConsent() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const update = () => setEnabled(readConsent() === "analytics");
    update();
    window.addEventListener("v3l0city-consent", update);
    return () => window.removeEventListener("v3l0city-consent", update);
  }, []);
  return enabled ? <Analytics /> : null;
}
