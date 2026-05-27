import {
  getSpeedometerScreenTitle,
  SPEEDOMETER_DRAWER_ITEMS,
} from '../src/utils/speedometerMenu';

describe('speedometerMenu', () => {
  it('includes Insights in the drawer menu', () => {
    expect(SPEEDOMETER_DRAWER_ITEMS.map((item) => item.key)).toEqual([
      'history',
      'insights',
      'settings',
      'json',
      'csv',
    ]);
    expect(
      SPEEDOMETER_DRAWER_ITEMS.find((item) => item.key === 'insights'),
    ).toMatchObject({
      title: 'Insights',
      icon: 'chart-line',
    });
  });

  it('maps screen state to appbar titles', () => {
    expect(getSpeedometerScreenTitle('dashboard')).toBe('V3l0city');
    expect(getSpeedometerScreenTitle('history')).toBe('History');
    expect(getSpeedometerScreenTitle('insights')).toBe('Insights');
  });
});
