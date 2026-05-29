import {
  getSpeedometerScreenTitle,
  SPEEDOMETER_DRAWER_GROUPS,
  SPEEDOMETER_DRAWER_ITEMS,
} from '../src/utils/speedometerMenu';

describe('speedometerMenu', () => {
  it('keeps the drawer root compact and groups all actions', () => {
    expect(SPEEDOMETER_DRAWER_GROUPS.map((group) => group.key)).toEqual([
      'drive',
      'social',
      'account',
      'system',
    ]);
    expect(SPEEDOMETER_DRAWER_GROUPS.map((group) => group.title)).toEqual([
      'Drive',
      'Social',
      'Account',
      'System',
    ]);
    expect(SPEEDOMETER_DRAWER_ITEMS.map((item) => item.key)).toEqual([
      'history',
      'insights',
      'leaderboards',
      'friends',
      'account',
      'settings',
      'privacy',
      'importJson',
      'json',
      'csv',
    ]);
    expect(
      SPEEDOMETER_DRAWER_GROUPS.find((group) => group.key === 'system')?.items.map(
        (item) => item.key,
      ),
    ).toEqual(['settings', 'privacy', 'importJson', 'json', 'csv']);
    expect(
      SPEEDOMETER_DRAWER_ITEMS.find((item) => item.key === 'insights'),
    ).toMatchObject({
      title: 'Insights',
      icon: 'chart-line',
    });
  });

  it('maps screen state to appbar titles', () => {
    expect(getSpeedometerScreenTitle('dashboard')).toBe('');
    expect(getSpeedometerScreenTitle('history')).toBe('History');
    expect(getSpeedometerScreenTitle('insights')).toBe('Insights');
    expect(getSpeedometerScreenTitle('leaderboards')).toBe('Leaderboards');
    expect(getSpeedometerScreenTitle('friends')).toBe('Find Friends');
    expect(getSpeedometerScreenTitle('account')).toBe('Account / Sync');
    expect(getSpeedometerScreenTitle('privacy')).toBe('Privacy');
    expect(getSpeedometerScreenTitle('onboarding')).toBe('Welcome');
  });
});
