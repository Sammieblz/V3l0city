export type SpeedometerScreen =
  | 'dashboard'
  | 'history'
  | 'insights'
  | 'leaderboards'
  | 'friends'
  | 'account'
  | 'privacy'
  | 'onboarding';

export type DrawerMenuItemKey =
  | 'history'
  | 'insights'
  | 'leaderboards'
  | 'friends'
  | 'account'
  | 'privacy'
  | 'settings'
  | 'importJson'
  | 'json'
  | 'csv';

export type DrawerMenuGroupKey = 'drive' | 'social' | 'account' | 'system';

export type DrawerMenuItemConfig = {
  key: DrawerMenuItemKey;
  title: string;
  description: string;
  icon: string;
};

export type DrawerMenuGroupConfig = {
  key: DrawerMenuGroupKey;
  title: string;
  description: string;
  icon: string;
  items: DrawerMenuItemConfig[];
};

export const SPEEDOMETER_DRAWER_GROUPS: DrawerMenuGroupConfig[] = [
  {
    key: 'drive',
    title: 'Drive',
    description: 'History and analytics',
    icon: 'steering',
    items: [
      {
        key: 'history',
        title: 'History',
        description: 'View trip history',
        icon: 'history',
      },
      {
        key: 'insights',
        title: 'Insights',
        description: 'Charts, trends, and activity heatmap',
        icon: 'chart-line',
      },
    ],
  },
  {
    key: 'social',
    title: 'Social',
    description: 'Friends and rankings',
    icon: 'account-group-outline',
    items: [
      {
        key: 'leaderboards',
        title: 'Leaderboards',
        description: 'Compare aggregate stats',
        icon: 'trophy-outline',
      },
      {
        key: 'friends',
        title: 'Find Friends',
        description: 'Search and discover drivers',
        icon: 'account-search-outline',
      },
    ],
  },
  {
    key: 'account',
    title: 'Account',
    description: 'Profile and cloud backup',
    icon: 'cloud-sync-outline',
    items: [
      {
        key: 'account',
        title: 'Account / Sync',
        description: 'Optional cloud backup',
        icon: 'cloud-sync-outline',
      },
    ],
  },
  {
    key: 'system',
    title: 'System',
    description: 'Settings, privacy, import, export',
    icon: 'cog-outline',
    items: [
      {
        key: 'settings',
        title: 'Settings',
        description: 'Units, orientation, and more',
        icon: 'cog',
      },
      {
        key: 'privacy',
        title: 'Privacy',
        description: 'Permissions and data storage',
        icon: 'shield-lock-outline',
      },
      {
        key: 'importJson',
        title: 'Import JSON',
        description: 'Restore a V3l0city export',
        icon: 'database-import-outline',
      },
      {
        key: 'json',
        title: 'Export JSON',
        description: 'Trips and preferences',
        icon: 'code-json',
      },
      {
        key: 'csv',
        title: 'Export CSV',
        description: 'Trip data as spreadsheet',
        icon: 'file-delimited',
      },
    ],
  },
];

export const SPEEDOMETER_DRAWER_ITEMS: DrawerMenuItemConfig[] =
  SPEEDOMETER_DRAWER_GROUPS.flatMap((group) => group.items);

export const getSpeedometerScreenTitle = (
  screen: SpeedometerScreen,
): string => {
  if (screen === 'history') return 'History';
  if (screen === 'insights') return 'Insights';
  if (screen === 'leaderboards') return 'Leaderboards';
  if (screen === 'friends') return 'Find Friends';
  if (screen === 'account') return 'Account / Sync';
  if (screen === 'privacy') return 'Privacy';
  if (screen === 'onboarding') return 'Welcome';
  return '';
};
