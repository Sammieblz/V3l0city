import {
  createLegalDocuments,
  DEFAULT_LEGAL_CONTACT_DETAILS,
  type LegalContactDetails,
} from '../../legal/legalDocuments';

const publicValue = (
  value: string | undefined,
  fallback: string,
): string => value?.trim() || fallback;

export const mobileLegalContactDetails: LegalContactDetails = {
  legalAddress: publicValue(
    process.env.EXPO_PUBLIC_LEGAL_ADDRESS,
    DEFAULT_LEGAL_CONTACT_DETAILS.legalAddress,
  ),
  legalEffectiveDate: publicValue(
    process.env.EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE,
    DEFAULT_LEGAL_CONTACT_DETAILS.legalEffectiveDate,
  ),
  legalEntityName: publicValue(
    process.env.EXPO_PUBLIC_LEGAL_ENTITY_NAME,
    DEFAULT_LEGAL_CONTACT_DETAILS.legalEntityName,
  ),
  privacyEmail: publicValue(
    process.env.EXPO_PUBLIC_PRIVACY_EMAIL,
    DEFAULT_LEGAL_CONTACT_DETAILS.privacyEmail,
  ),
  safetyEmail: publicValue(
    process.env.EXPO_PUBLIC_SAFETY_EMAIL,
    DEFAULT_LEGAL_CONTACT_DETAILS.safetyEmail,
  ),
  siteUrl: publicValue(
    process.env.EXPO_PUBLIC_SITE_URL,
    DEFAULT_LEGAL_CONTACT_DETAILS.siteUrl,
  ),
  supportEmail: publicValue(
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
    DEFAULT_LEGAL_CONTACT_DETAILS.supportEmail,
  ),
  termsVersion: publicValue(
    process.env.EXPO_PUBLIC_TERMS_VERSION,
    DEFAULT_LEGAL_CONTACT_DETAILS.termsVersion,
  ),
};

export const mobileLegalDocuments = createLegalDocuments(
  mobileLegalContactDetails,
);
