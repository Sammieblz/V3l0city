import { LegalPage } from "@/components/marketing/legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Cookie notice", description: "How V3l0city uses necessary browser storage and consent-gated analytics.", path: "/cookies" });

export default function CookiesPage() {
  return <LegalPage title={<>Cookie<br /><span className="accent">notice.</span></>} intro="V3l0city keeps nonessential analytics off until you choose it. This notice covers cookies and similar browser storage used on the web release." sections={[
    { title: "Necessary storage", content: <p>Supabase authentication uses secure session cookies. V3l0city also uses browser storage for your cookie choice and, after sign-in, a separate IndexedDB trip library. These are required for requested features and cannot be managed through the analytics toggle.</p> },
    { title: "Optional analytics", content: <p>After explicit Analytics consent, V3l0city loads Vercel Web Analytics to understand aggregate page use. We do not enable advertising pixels, cross-site behavioral advertising, session replay, fingerprinting, or analytics that include trip values, location, or account email.</p> },
    { title: "Your controls", content: <p>Choose Necessary only or Allow analytics in the banner. You can change your decision in Account settings, clear browser storage, or use browser controls. Withdrawal prevents future optional analytics loading; it does not retroactively remove aggregated measurements already received by the provider.</p> },
    { title: "Third parties", content: <p>If enabled, Cloudflare Turnstile may set or access browser data to protect authentication from automated abuse. Its use is governed by Cloudflare’s privacy terms. Supabase provides authentication cookies and Vercel hosts the website.</p> },
  ]} />;
}
