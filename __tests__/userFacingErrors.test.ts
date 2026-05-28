import {
  getNativeSpeedErrorMessage,
  getUserFacingErrorMessage,
} from '../src/utils/userFacingErrors';

describe('userFacingErrors', () => {
  it('hides raw auth provider messages behind user-friendly copy', () => {
    expect(
      getUserFacingErrorMessage(
        new Error('duplicate key value violates unique constraint "profiles_username_unique"'),
        'auth',
      ),
    ).toBe('That username is already taken.');

    expect(
      getUserFacingErrorMessage(new Error('Invalid login credentials'), 'auth'),
    ).toBe('Email or password is incorrect.');
  });

  it('maps network and permission errors without implementation details', () => {
    expect(
      getUserFacingErrorMessage(new Error('TypeError: Failed to fetch'), 'sync'),
    ).toBe('Check your connection and try again.');

    expect(
      getUserFacingErrorMessage(new Error('row-level security violation'), 'sync'),
    ).toBe('You do not have permission to do that.');
  });

  it('maps native speed error codes to readable copy', () => {
    expect(getNativeSpeedErrorMessage('precise_location_required')).toBe(
      'Enable Precise Location for accurate speed and compass readings.',
    );
    expect(getNativeSpeedErrorMessage('unknown')).toBe(
      'Sensors could not start. Check permissions and try again.',
    );
  });
});
