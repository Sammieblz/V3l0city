import { SharedLegalPage } from "@/components/marketing/shared-legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Terms of Service", description: "The rules for using the V3l0city website and dashboard.", path: "/terms" });

export default function TermsPage() {
  return <SharedLegalPage documentId="terms" />;
}
