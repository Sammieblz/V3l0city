import { LegalPage } from "@/components/marketing/legal-page";
import { appConfig } from "@/lib/config";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Terms of Service", description: "The rules for using the V3l0city website and dashboard.", path: "/terms" });

export default function TermsPage() {
  return <LegalPage title={<>Terms of<br /><span className="accent">Service.</span></>} intro="These draft terms define the intended rules for the V3l0city web release. Governing law, dispute provisions, liability language, and enforceability must be finalized by licensed counsel before launch." sections={[
    { title: "Agreement and eligibility", content: <p>By creating an account or using V3l0city, you agree to these Terms and the Privacy Notice. You confirm that you are at least 16 years old and can enter this agreement. If you use the service for an organization, you confirm you can bind that organization.</p> },
    { title: "Drive safely and lawfully", content: <p>Do not operate, read, configure, or interact with V3l0city while driving or otherwise when doing so may be unsafe or unlawful. Follow all traffic laws and use your vehicle’s controls and road conditions—not V3l0city—as the authoritative source. V3l0city is not a safety device, navigation system, regulated measurement instrument, or substitute for your vehicle speedometer.</p> },
    { title: "Browser limitations", content: <p>Browser recording requires a compatible mobile device, HTTPS, location permission, and a page that stays open, visible, and unlocked. It may stop, become inaccurate, or contain gaps when the page backgrounds, the device locks, permissions change, connectivity fails, or browser/device software limits access. We do not promise continuous, accurate, or emergency use.</p> },
    { title: "Accounts, data, and social features", content: <p>You are responsible for your credentials and for information associated with your account. Cloud backup, public/friend leaderboards, and nearby discovery are optional. Do not use social features to encourage unlawful, reckless, or competitive driving. Usernames and public profile material must comply with the Acceptable Use Policy.</p> },
    { title: "Acceptable use and enforcement", content: <p>You may not misuse the service, probe security, impersonate others, scrape it, harass users, upload unlawful content, manipulate leaderboards, or use V3l0city in violation of law. We may suspend or terminate accounts to protect people, the service, or legal rights.</p> },
    { title: "Ownership, changes, and termination", content: <p>{appConfig.legalEntityName} retains rights in V3l0city and its brand. You retain rights in your information, subject to rights needed to operate the service. We may change or discontinue features; material changes will be announced where required. You may delete your account through settings.</p> },
    { title: "Disclaimers, liability, and contact", content: <p>Production terms must include attorney-approved warranty disclaimers, limitations of liability, indemnity, dispute resolution, governing law, and jurisdiction appropriate to {appConfig.legalEntityName}. For support, contact <a href={`mailto:${appConfig.supportEmail}`}>{appConfig.supportEmail}</a>.</p> },
  ]} />;
}
