import { SharedLegalPage } from "@/components/marketing/shared-legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Data rights", description: "Use V3l0city’s controls to access, export, correct, or delete your data.", path: "/data-rights" });

export default function DataRightsPage() {
  return <SharedLegalPage documentId="data-rights" />;
}
