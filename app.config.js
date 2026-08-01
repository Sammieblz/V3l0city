const { expo } = require('./app.json');

const productionLegalKeys = [
  'EXPO_PUBLIC_SITE_URL',
  'EXPO_PUBLIC_LEGAL_ENTITY_NAME',
  'EXPO_PUBLIC_LEGAL_ADDRESS',
  'EXPO_PUBLIC_PRIVACY_EMAIL',
  'EXPO_PUBLIC_SUPPORT_EMAIL',
  'EXPO_PUBLIC_SAFETY_EMAIL',
  'EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE',
  'EXPO_PUBLIC_TERMS_VERSION',
];

module.exports = () => {
  if (process.env.V3L0CITY_RELEASE_ENV === 'production') {
    const missing = productionLegalKeys.filter(
      (key) => !process.env[key]?.trim(),
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required Android production legal configuration: ${missing.join(', ')}`,
      );
    }
  }

  return expo;
};
