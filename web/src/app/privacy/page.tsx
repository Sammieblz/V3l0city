import { SharedLegalPage } from "@/components/marketing/shared-legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Privacy notice", description: "How V3l0city collects, uses, stores, and protects personal information.", path: "/privacy" });

export default function PrivacyPage() {
  return <SharedLegalPage documentId="privacy" />;
}
