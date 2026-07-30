"use client";

import { Turnstile } from "@marsidev/react-turnstile";

import { appConfig } from "@/lib/config";

export function TurnstileField({ onToken }: { onToken: (token: string | null) => void }) {
  if (!appConfig.turnstileSiteKey) {
    return <p className="captcha-note">Bot protection will be active when the production Turnstile key is configured.</p>;
  }
  return <Turnstile siteKey={appConfig.turnstileSiteKey} options={{ theme: "dark", size: "flexible" }} onSuccess={(token) => onToken(token)} onExpire={() => onToken(null)} onError={() => onToken(null)} />;
}
