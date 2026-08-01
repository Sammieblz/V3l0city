import { mobileLegalContactDetails, mobileLegalDocuments } from './legalDocuments';

/** @deprecated Render LegalCenterScreen to expose the complete legal set. */
export type PrivacyPolicySection = {
  title: string;
  body: string[];
};

export const PRIVACY_POLICY_UPDATED_AT =
  mobileLegalContactDetails.legalEffectiveDate;

export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] =
  mobileLegalDocuments.privacy.sections.map((section) => ({
    title: section.title,
    body: section.paragraphs,
  }));
