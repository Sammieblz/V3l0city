export type PrivacyPolicySection = {
  title: string;
  body: string[];
};

export const PRIVACY_POLICY_UPDATED_AT = 'May 27, 2026';

export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: 'Core Promise',
    body: [
      'You can use V3l0city without creating an account.',
      'Your trips and settings stay on your phone unless you choose to turn on an online feature, such as online backup, nearby discovery, leaderboards, or optional troubleshooting.',
    ],
  },
  {
    title: 'Permissions',
    body: [
      'Precise location while the app is open is needed to show accurate speed, distance, and direction. Approximate location is not accurate enough for a speedometer.',
      'Motion access may be used to keep speed and direction smoother between location updates. On iPhone, your phone may ask for this permission.',
      'Notifications are optional. They are used for trip-saved alerts and optional account features.',
      'Internet access is optional for local use. It is used only when you turn on online backup, friends, leaderboards, or troubleshooting.',
    ],
  },
  {
    title: 'Data Stored On This Device',
    body: [
      'Your phone stores saved trips, speed readings, app settings, unfinished trip recovery, and backup status.',
      'Your phone also stores a small anonymous app ID and whether you finished the first-launch setup.',
      'If you sign in, your phone stores a secure sign-in token so you do not have to log in every time. V3l0city does not store your password.',
      'Exports are created from the data on your phone, so you can keep a copy or move your data elsewhere.',
    ],
  },
  {
    title: 'Data Sent Online',
    body: [
      'If you sign in and turn on online backup, V3l0city can upload your profile choices, saved trip summaries, and speed readings so you can restore them on another device.',
      'If you turn on nearby discovery, V3l0city sends only a general nearby area. It does not use your exact route or exact location for friend discovery.',
      'If you turn on leaderboards, V3l0city shares ranking totals such as distance, max speed, and trip count. Other users cannot see your detailed trips.',
      'If troubleshooting data sharing is enabled in this build, active-trip speed readings may be sent to help improve or fix the app. The speedometer still works without this.',
    ],
  },
  {
    title: 'Data Not Collected For Social Features',
    body: [
      'V3l0city does not share exact trip routes with friends, nearby users, or leaderboards.',
      'V3l0city does not upload your contacts for friend discovery.',
      'V3l0city is designed for use while the app is open. It does not add background trip sharing for friends or leaderboards.',
    ],
  },
  {
    title: 'Control',
    body: [
      'You can use V3l0city without an account for as long as you want.',
      'You can export your local data as JSON or CSV from the app menu.',
      'Signing out removes the sign-in token from this phone and pauses online backup. Trips saved on this phone remain here.',
      'Disabling nearby discovery or leaderboards stops future participation in those online features.',
    ],
  },
];
