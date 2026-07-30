import { LegalPage } from "@/components/marketing/legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Driving safety", description: "V3l0city driving safety guidance and browser recording limitations.", path: "/safety" });

export default function SafetyPage() {
  return <LegalPage eyebrow="Safety first" title={<>The road gets<br /><span className="gold">your attention.</span></>} intro="The product is designed around a simple rule: do not interact with the dashboard while operating a vehicle." sections={[
    { title: "Before you move", content: <p>Set up your account, privacy choices, and trip settings while parked. If you decide to record in a mobile browser, start the trip before driving and place the device where it does not obstruct your view or violate local law.</p> },
    { title: "While recording", content: <p>Keep the page open, visible, and unlocked. Do not adjust controls, check leaderboards, respond to friends, or troubleshoot the dashboard while driving. Pull over safely before interacting with V3l0city.</p> },
    { title: "Browser limitations", content: <p>Web browsers can suspend location access when the page backgrounds or the device locks. GPS and speed readings can be delayed, missing, or inaccurate. A trip record is retrospective information, not a safety signal or speed limit indicator.</p> },
    { title: "Community metrics", content: <p>Distance, trip count, average speed, and maximum speed are personal statistics, never a challenge, achievement, or reason to drive faster. Do not compare, compete, or make decisions based on these values.</p> },
  ]} />;
}
