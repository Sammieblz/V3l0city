import { LegalPage } from "@/components/marketing/legal-page";
import { appConfig } from "@/lib/config";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Data rights", description: "Use V3l0city’s controls to access, export, correct, or delete your data.", path: "/data-rights" });

export default function DataRightsPage() {
  return <LegalPage title={<>Your data,<br /><span className="accent">your controls.</span></>} intro="Use the web dashboard to manage information directly, or contact us for a privacy request." sections={[
    { title: "Access and correct", content: <p>Account settings let you review and edit your username, display name, and sharing choices. Trip history and insights are available after local or cloud restore.</p> },
    { title: "Export", content: <p>Use Account settings to download browser-held trip data as JSON or CSV. To include cloud trips, restore them into the browser library first. We may require identity verification for requests made outside the product.</p> },
    { title: "Delete", content: <p>You can clear the separate browser database without affecting the cloud account. Permanent account deletion requires a current password and typed confirmation, signs you out, and removes user-owned cloud data subject to limited legal/security retention.</p> },
    { title: "Contact", content: <p>For rights requests, authorized-agent requests, or questions, email <a href={`mailto:${appConfig.privacyEmail}`}>{appConfig.privacyEmail}</a>. Production operations must document verification steps and applicable response deadlines.</p> },
  ]} />;
}
