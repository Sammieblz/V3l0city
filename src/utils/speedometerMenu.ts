export type SpeedometerScreen = 'dashboard' | 'history' | 'insights';

export type DrawerMenuItemKey =
  | 'history'
  | 'insights'
  | 'settings'
  | 'json'
  | 'csv';

export type DrawerMenuItemConfig = {
  key: DrawerMenuItemKey;
  title: string;
  description: string;
  icon: string;
};

export const SPEEDOMETER_DRAWER_ITEMS: DrawerMenuItemConfig[] = [
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
  {
    key: 'settings',
    title: 'Settings',
    description: 'Units, orientation, and more',
    icon: 'cog',
  },
  {
    key: 'json',
    title: 'Export as JSON',
    description: 'Trips and preferences',
    icon: 'code-json',
  },
  {
    key: 'csv',
    title: 'Export as CSV',
    description: 'Trip data as spreadsheet',
    icon: 'file-delimited',
  },
];

export const getSpeedometerScreenTitle = (
  screen: SpeedometerScreen,
): string => {
  if (screen === 'history') return 'History';
  if (screen === 'insights') return 'Insights';
  return 'V3l0city';
};
