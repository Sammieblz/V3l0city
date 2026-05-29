import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AccountSyncScreen from '../src/components/AccountSyncScreen';
import { cloudAuth, isCloudConfigured } from '../src/cloud/cloudService';
import { getPendingSyncChangeCount } from '../src/database/tripRepository';

jest.mock('../src/cloud/cloudService', () => ({
  cloudAuth: {
    getProfile: jest.fn(),
    getSession: jest.fn(),
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
    signUpWithEmail: jest.fn(),
  },
  completeCloudOnboarding: jest.fn(),
  isCloudConfigured: jest.fn(),
  restoreCloudTrips: jest.fn(),
  saveCloudProfile: jest.fn(),
  syncLocalChanges: jest.fn(),
}));

jest.mock('../src/cloud/utils/coarseLocation', () => ({
  getCoarseLocation: jest.fn(),
}));

jest.mock('../src/database/tripRepository', () => ({
  getPendingSyncChangeCount: jest.fn(),
}));

const cloudAuthMock = cloudAuth as jest.Mocked<typeof cloudAuth>;
const isCloudConfiguredMock = isCloudConfigured as jest.MockedFunction<
  typeof isCloudConfigured
>;
const getPendingSyncChangeCountMock =
  getPendingSyncChangeCount as jest.MockedFunction<
    typeof getPendingSyncChangeCount
  >;

const renderText = (renderer: ReactTestRenderer) =>
  JSON.stringify(renderer.toJSON());

describe('AccountSyncScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isCloudConfiguredMock.mockReturnValue(true);
    getPendingSyncChangeCountMock.mockResolvedValue(0);
  });

  it('opens account settings for an already signed-in user', async () => {
    cloudAuthMock.getSession.mockResolvedValue({
      accessToken: 'token',
      email: 'sam@example.com',
      userId: 'user-1',
    });
    cloudAuthMock.getProfile.mockResolvedValue({
      displayName: 'Sam',
      leaderboardOptIn: true,
      nearbyOptIn: false,
      onboardingCompletedAt: '2026-05-28T00:00:00.000Z',
      syncEnabled: true,
      userId: 'user-1',
      username: 'sam',
    });

    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(<AccountSyncScreen initialStep="landing" />);
    });

    if (!renderer) {
      throw new Error('AccountSyncScreen renderer was not created');
    }

    expect(renderText(renderer)).toContain('Profile settings');
    expect(renderText(renderer)).toContain('Automatic cloud backup');
    expect(renderText(renderer)).not.toContain('Sign up');
    expect(renderText(renderer)).not.toContain('Sign in');
  });
});
