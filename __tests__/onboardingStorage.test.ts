jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getLocalOnboardingState,
  hasCompletedLocalOnboarding,
  markLocalOnboardingComplete,
  resetLocalOnboardingForTests,
} from '../src/onboarding/onboardingStorage';

describe('onboardingStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('treats a fresh install as not onboarded', async () => {
    await expect(hasCompletedLocalOnboarding()).resolves.toBe(false);
    await expect(getLocalOnboardingState()).resolves.toEqual({
      completedAt: null,
      version: 1,
    });
  });

  it('stores first-install onboarding completion locally', async () => {
    await markLocalOnboardingComplete(new Date('2026-05-27T12:00:00.000Z'));

    await expect(hasCompletedLocalOnboarding()).resolves.toBe(true);
    await expect(getLocalOnboardingState()).resolves.toEqual({
      completedAt: '2026-05-27T12:00:00.000Z',
      version: 1,
    });
  });

  it('can reset onboarding state for deterministic tests', async () => {
    await markLocalOnboardingComplete(new Date('2026-05-27T12:00:00.000Z'));
    await resetLocalOnboardingForTests();

    await expect(hasCompletedLocalOnboarding()).resolves.toBe(false);
  });
});
