import {
  createLegalDocuments,
  type LegalDocumentId,
} from "../../../../legal/legalDocuments";

import { LegalPage } from "@/components/marketing/legal-page";
import { appConfig } from "@/lib/config";

export function SharedLegalPage({ documentId }: { documentId: LegalDocumentId }) {
  const document = createLegalDocuments(appConfig)[documentId];

  return (
    <LegalPage
      eyebrow={document.eyebrow}
      title={document.title}
      intro={document.intro}
      sections={document.sections.map((section) => ({
        title: section.title,
        content: (
          <>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </>
        ),
      }))}
    />
  );
}
