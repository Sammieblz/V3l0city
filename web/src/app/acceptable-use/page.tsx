import { SharedLegalPage } from "@/components/marketing/shared-legal-page";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Acceptable use", description: "The community and service-use rules for V3l0city.", path: "/acceptable-use" });

export default function AcceptableUsePage() {
  return <SharedLegalPage documentId="acceptable-use" />;
}
