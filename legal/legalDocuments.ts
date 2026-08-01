export type LegalContactDetails = {
  legalAddress: string;
  legalEffectiveDate: string;
  legalEntityName: string;
  privacyEmail: string;
  safetyEmail: string;
  siteUrl: string;
  supportEmail: string;
  termsVersion: string;
};

export type LegalDocumentId =
  | 'privacy'
  | 'terms'
  | 'cookies'
  | 'safety'
  | 'acceptable-use'
  | 'data-rights';

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export type LegalDocument = {
  eyebrow: string;
  id: LegalDocumentId;
  intro: string;
  navigationLabel: string;
  sections: LegalSection[];
  title: string;
};

export const DEFAULT_LEGAL_CONTACT_DETAILS: LegalContactDetails = {
  legalAddress: 'Legal address supplied before launch',
  legalEffectiveDate: 'July 31, 2026',
  legalEntityName: 'V3l0city',
  privacyEmail: 'privacy@example.com',
  safetyEmail: 'safety@example.com',
  siteUrl: 'https://www.example.com',
  supportEmail: 'support@example.com',
  termsVersion: '2026-07-31',
};

const interpolate = (text: string, contact: LegalContactDetails) =>
  text.replace(/\{(\w+)\}/g, (_, key: keyof LegalContactDetails) => contact[key] ?? '');

const section = (
  title: string,
  paragraphs: string[],
  contact: LegalContactDetails,
): LegalSection => ({
  title,
  paragraphs: paragraphs.map((paragraph) => interpolate(paragraph, contact)),
});

/**
 * The web and native apps deliberately render these same commitments. Keep
 * browser-only and native-only limitations explicit instead of implying that
 * one platform has the other platform's capabilities.
 */
export const createLegalDocuments = (
  contactOverrides: Partial<LegalContactDetails> = {},
): Record<LegalDocumentId, LegalDocument> => {
  const contact = { ...DEFAULT_LEGAL_CONTACT_DETAILS, ...contactOverrides };

  return {
    privacy: {
      id: 'privacy',
      navigationLabel: 'Privacy notice',
      eyebrow: 'Legal & privacy',
      title: 'Privacy notice',
      intro:
        'This notice explains how V3l0city handles personal information across the website, browser dashboard, native mobile apps, and related support interactions. It requires qualified legal review before production launch.',
      sections: [
        section('Who controls your information', [
          '{legalEntityName} is the controller for the personal information described here. Contact {privacyEmail}, or write to {legalEntityName}, {legalAddress}.',
        ], contact),
        section('Information we collect', [
          'Account information: email address, username, display name, authentication/session data, and legal-acceptance records.',
          'Trip information: started/ended time, distance, derived speed samples, and trip summaries. V3l0city does not persist raw route coordinates in its web or mobile trip libraries.',
          'Privacy choices: cloud-backup, leaderboard, nearby-discovery, legal-acceptance, appearance, and web cookie-consent choices where applicable.',
          'Optional nearby data: a coarse area cell only when you deliberately enable nearby discovery. It is not an exact location or route.',
          'Technical information: on-device or browser storage, security/audit records, and consent-gated aggregate website analytics.',
        ], contact),
        section('Why we use it', [
          'We use this information to provide authentication, profile settings, local trip storage, optional cloud restore, exports, and support.',
          'We operate opt-in friends and leaderboards, prevent abuse, protect the service, investigate security issues, honor legal obligations, and enforce our terms.',
          'Website analytics load only after analytics consent. We do not use advertising pixels, fingerprinting, session replay, or analytics that include trip values, location, or account email.',
        ], contact),
        section('Location, permissions, and platform limits', [
          'The native app requests precise location only after you choose Start Trip. During a user-started Android trip, a visible active-trip notification accompanies the location foreground service while recording can continue after screen lock or app switching. The Android app does not request ACCESS_BACKGROUND_LOCATION.',
          'Browser recording requires a compatible mobile browser, HTTPS, location permission, and a page that remains open, visible, and unlocked. Browsers can suspend or interrupt location when the page backgrounds or the device locks.',
          'Motion access may help smooth speed and direction between location updates. Notifications are optional for saved-trip alerts; Android uses the active-trip notification while its foreground service is recording.',
        ], contact),
        section('Choices, sharing, and international transfers', [
          'Where applicable, we process accounts and requested product features to perform our contract with you; security and service improvement for legitimate interests; and optional analytics, nearby discovery, and similar features based on your choice.',
          'Service providers may include Supabase for application data and authentication, Vercel for the website, Cloudflare Turnstile for web authentication abuse protection, Expo for native app services when enabled, and app-distribution/platform providers. They process data to provide their services.',
          'Data may be processed outside your country. Production launch requires appropriate transfer safeguards and vendor agreements where required.',
        ], contact),
        section('Retention, deletion, and rights', [
          'Local mobile data remains on the device until you delete or clear it. Browser data remains in that browser until you clear it. Cloud account data remains while the account is active, then is removed through self-service deletion subject to limited security, backup, and legal-retention periods that must be finalized in the production retention schedule.',
          'Depending on where you live, you may have rights to access, correct, delete, export, restrict, object to, or withdraw consent for some processing. Use account controls for common requests or contact {privacyEmail}. We do not sell personal information or use it for cross-context behavioral advertising, and we do not discriminate for exercising privacy rights.',
        ], contact),
        section('Children and updates', [
          'V3l0city is not for people under 16. We do not knowingly collect personal information from children under 16.',
          'We will update this notice when practices change and record a new effective date and version.',
        ], contact),
      ],
    },
    terms: {
      id: 'terms',
      navigationLabel: 'Terms of Service',
      eyebrow: 'Legal & privacy',
      title: 'Terms of Service',
      intro:
        'These terms govern use of the V3l0city website, browser dashboard, native mobile apps, and related services. Governing law, dispute provisions, liability language, and enforceability require licensed counsel before launch.',
      sections: [
        section('Agreement and eligibility', [
          'By creating an account or using V3l0city, you agree to these Terms and the Privacy Notice. You confirm that you are at least 16 years old and can enter this agreement. If you use the service for an organization, you confirm you can bind that organization.',
        ], contact),
        section('Drive safely and lawfully', [
          'Do not operate, read, configure, or interact with V3l0city while driving or otherwise when doing so may be unsafe or unlawful. Follow all traffic laws and use your vehicle controls and road conditions, not V3l0city, as the authoritative source.',
          'V3l0city is not a safety device, navigation system, regulated measurement instrument, emergency service, or replacement for your vehicle speedometer.',
        ], contact),
        section('Platform limitations', [
          'Web recording may stop, become inaccurate, or contain gaps when the page backgrounds, the device locks, permissions change, connectivity fails, or browser/device software limits access.',
          'Native recording is user-started and can also be delayed, interrupted, or affected by device permissions, operating-system restrictions, sensor accuracy, connectivity, battery management, and hardware. We do not promise continuous, accurate, or emergency use on any platform.',
        ], contact),
        section('Accounts, data, and social features', [
          'You are responsible for your credentials and information associated with your account. Cloud backup, public/friend leaderboards, and nearby discovery are optional.',
          'Do not use social features to encourage unlawful, reckless, or competitive driving. Usernames and public profile material must comply with the Acceptable Use Policy.',
        ], contact),
        section('Acceptable use and enforcement', [
          'You may not misuse the service, probe security, impersonate others, scrape it, harass users, upload unlawful content, falsify trip data, manipulate leaderboards, or use V3l0city in violation of law.',
          'We may investigate reports and suspend or terminate accounts to protect people, the service, or legal rights.',
        ], contact),
        section('Ownership, changes, and contact', [
          '{legalEntityName} retains rights in V3l0city and its brand. You retain rights in your information, subject to rights needed to operate the service.',
          'We may change or discontinue features; material changes will be announced where required. You may delete your account through settings. For support, contact {supportEmail}.',
        ], contact),
      ],
    },
    cookies: {
      id: 'cookies',
      navigationLabel: 'Cookie & storage notice',
      eyebrow: 'Legal & privacy',
      title: 'Cookie & storage notice',
      intro:
        'This notice explains necessary browser storage and consent-gated website analytics. Native mobile apps use device storage rather than browser cookies, but are included here so the controls are clear across V3l0city.',
      sections: [
        section('Necessary storage', [
          'On the website, Supabase authentication uses secure session cookies. V3l0city also uses browser storage for the cookie choice and, after sign-in, a separate IndexedDB trip library. These are required for requested browser features.',
          'The native apps store requested app data, settings, and secure sign-in tokens on the device. They do not use browser cookies.',
        ], contact),
        section('Optional analytics', [
          'After explicit Analytics consent, the website loads Vercel Web Analytics to understand aggregate page use. We do not enable advertising pixels, cross-site behavioral advertising, session replay, fingerprinting, or analytics that include trip values, location, or account email.',
        ], contact),
        section('Your controls and third parties', [
          'On the website, choose Necessary only or Allow analytics in the banner, change the decision in account settings, or clear browser storage. Withdrawal prevents future optional analytics loading but cannot retroactively remove aggregated measurements already received by a provider.',
          'Cloudflare Turnstile may set or access browser data to protect web authentication from automated abuse. Supabase provides authentication cookies and Vercel hosts the website.',
        ], contact),
      ],
    },
    safety: {
      id: 'safety',
      navigationLabel: 'Driving safety',
      eyebrow: 'Safety first',
      title: 'The road gets your attention.',
      intro:
        'The product is designed around a simple rule: do not interact with V3l0city while operating a vehicle.',
      sections: [
        section('Before you move', [
          'Set up your account, privacy choices, and trip settings while parked. Start a native trip, or a compatible mobile-browser trip, before driving. Place the device where it does not obstruct your view or violate local law.',
        ], contact),
        section('While recording', [
          'Do not adjust controls, check leaderboards, respond to friends, or troubleshoot the dashboard while driving. Pull over safely before interacting with V3l0city.',
          'For browser recording, keep the page open, visible, and unlocked. For Android native recording, watch for the active-trip notification and stop and save the trip when you are done.',
        ], contact),
        section('Data limitations', [
          'GPS, sensor, and speed readings can be delayed, missing, or inaccurate. A trip record is retrospective information, not a safety signal, speed-limit indicator, or reason to change how you drive.',
        ], contact),
        section('Community metrics', [
          'Distance, trip count, average speed, and maximum speed are personal statistics, never a challenge, achievement, or reason to drive faster. Do not compare, compete, or make decisions based on these values.',
        ], contact),
      ],
    },
    'acceptable-use': {
      id: 'acceptable-use',
      navigationLabel: 'Acceptable use',
      eyebrow: 'Legal & privacy',
      title: 'Acceptable use',
      intro:
        'V3l0city offers limited public-profile, friend, and leaderboard features. These rules help keep them useful and safe.',
      sections: [
        section('Be respectful', [
          'Do not use usernames, display names, reports, or account activity to threaten, harass, discriminate against, impersonate, expose private information, or otherwise harm another person.',
        ], contact),
        section('Do not manipulate the service', [
          'Do not automate, scrape, reverse engineer, overload, probe, falsify trip data, evade privacy choices, or manipulate friends or leaderboards. Do not use the product in a way that could compromise security or reliability.',
        ], contact),
        section('No unsafe driving', [
          'Do not use V3l0city to encourage speeding, competitions, distracted driving, or any other unlawful or unsafe activity. Report profiles that appear to violate these rules.',
        ], contact),
        section('Enforcement and contact', [
          'We may investigate reports, limit features, remove profile visibility, or suspend accounts. Contact {safetyEmail} if you believe an action was incorrect or need to report a non-emergency safety concern.',
        ], contact),
      ],
    },
    'data-rights': {
      id: 'data-rights',
      navigationLabel: 'Data rights',
      eyebrow: 'Legal & privacy',
      title: 'Your data, your controls.',
      intro:
        'Use V3l0city controls to manage common requests directly, or contact us for a privacy request.',
      sections: [
        section('Access and correct', [
          'Account settings let you review and edit your username, display name, and sharing choices. Trip history and insights are available from local storage or after cloud restore.',
        ], contact),
        section('Export', [
          'Use the app or web dashboard to download locally held trip data as JSON or CSV. To include cloud trips, restore them into that device or browser library first. We may require identity verification for requests made outside the product.',
        ], contact),
        section('Delete', [
          'You can clear a browser database or mobile trip library without affecting the cloud account. Permanent account deletion requires a current password and typed confirmation, signs you out, and removes user-owned cloud data subject to limited legal and security retention.',
        ], contact),
        section('Contact', [
          'For rights requests, authorized-agent requests, or questions, email {privacyEmail}. Production operations must document verification steps and applicable response deadlines.',
        ], contact),
      ],
    },
  };
};

export const LEGAL_DOCUMENT_ORDER: LegalDocumentId[] = [
  'privacy',
  'terms',
  'safety',
  'acceptable-use',
  'data-rights',
  'cookies',
];
