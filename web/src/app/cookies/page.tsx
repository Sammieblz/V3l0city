import { SharedLegalPage } from "@/components/marketing/shared-legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Cookie notice", description: "How V3l0city uses necessary browser storage and consent-gated analytics.", path: "/cookies" });

export default function CookiesPage() {
  return <SharedLegalPage documentId="cookies" />;
}
