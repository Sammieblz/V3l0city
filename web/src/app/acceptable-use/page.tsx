import { LegalPage } from "@/components/marketing/legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Acceptable use", description: "The community and service-use rules for V3l0city.", path: "/acceptable-use" });

export default function AcceptableUsePage() {
  return <LegalPage title={<>Acceptable<br /><span className="accent">use.</span></>} intro="V3l0city offers limited public-profile, friend, and leaderboard features. These rules help keep them useful and safe." sections={[
    { title: "Be respectful", content: <p>Do not use usernames, display names, reports, or account activity to threaten, harass, discriminate against, impersonate, expose private information, or otherwise harm another person.</p> },
    { title: "Do not manipulate the service", content: <p>Do not automate, scrape, reverse engineer, overload, probe, falsify trip data, evade privacy choices, or manipulate friends or leaderboards. Do not use the product in a way that could compromise security or reliability.</p> },
    { title: "No unsafe driving", content: <p>Do not use V3l0city to encourage speeding, competitions, distracted driving, or any other unlawful or unsafe activity. Report profiles that appear to violate these rules.</p> },
    { title: "Enforcement", content: <p>We may investigate reports, limit features, remove profile visibility, or suspend accounts. Contact us if you believe an action was incorrect.</p> },
  ]} />;
}
