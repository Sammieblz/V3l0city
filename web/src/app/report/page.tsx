import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { appConfig } from "@/lib/config";
import { noIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = { title: "Report a profile", description: "How to report abuse or unsafe community activity on V3l0city.", ...noIndexMetadata };

export default function ReportPage() {
  return <LegalPage eyebrow="Community safety" title={<>Report a<br /><span className="accent">profile.</span></>} intro="Signed-in users can report a profile from Friends. Do not use the report flow for emergencies or urgent safety matters." sections={[
    { title: "In the dashboard", content: <p>Open Friends, select Report beside the profile, choose the closest reason, and include only the context needed for review. You can also block a profile to stop friend interactions.</p> },
    { title: "Urgent situations", content: <p>V3l0city does not provide emergency response. If someone is in immediate danger, contact local emergency services. Do not rely on this site to report an active driving hazard.</p> },
    { title: "Contact", content: <p>For account, legal, or safety reports that cannot be submitted in the dashboard, email <a href={`mailto:${appConfig.safetyEmail}`}>{appConfig.safetyEmail}</a>.</p> },
  ]} />;
}
