import { SharedLegalPage } from "@/components/marketing/shared-legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Driving safety", description: "V3l0city driving safety guidance and browser recording limitations.", path: "/safety" });

export default function SafetyPage() {
  return <SharedLegalPage documentId="safety" />;
}
