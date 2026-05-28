import { SupabaseSocialProvider } from '../src/cloud/supabase/socialProvider';
import { getSupabaseClient } from '../src/cloud/supabase/client';

jest.mock('../src/cloud/supabase/client', () => ({
  getSupabaseClient: jest.fn(),
}));

describe('SupabaseSocialProvider', () => {
  const invoke = jest.fn();

  beforeEach(() => {
    invoke.mockReset();
    (getSupabaseClient as jest.Mock).mockReturnValue({
      functions: { invoke },
    });
  });

  it('loads friend request buckets from the friend-requests function', async () => {
    invoke.mockResolvedValue({
      data: {
        incoming: [{ userId: 'u1' }],
        outgoing: [{ userId: 'u2' }],
        friends: [{ userId: 'u3' }],
      },
      error: null,
    });

    await expect(new SupabaseSocialProvider().getFriendRequests()).resolves.toEqual({
      incoming: [{ userId: 'u1' }],
      outgoing: [{ userId: 'u2' }],
      friends: [{ userId: 'u3' }],
    });
    expect(invoke).toHaveBeenCalledWith('friend-requests', { body: {} });
  });

  it('loads aggregate-safe profile summaries', async () => {
    invoke.mockResolvedValue({
      data: {
        user: {
          userId: 'u1',
          username: 'driver',
          displayName: 'Driver',
          relationship: 'friends',
          statsVisible: true,
          stats: { tripCount: 2 },
        },
      },
      error: null,
    });

    await expect(new SupabaseSocialProvider().getFriendProfile('u1')).resolves.toMatchObject({
      userId: 'u1',
      statsVisible: true,
    });
    expect(invoke).toHaveBeenCalledWith('profile-summary', {
      body: { userId: 'u1' },
    });
  });

  it('maps cancel and remove actions through friend-respond', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const provider = new SupabaseSocialProvider();

    await provider.cancelFriendRequest('u1');
    await provider.removeFriend('u2');

    expect(invoke).toHaveBeenNthCalledWith(1, 'friend-respond', {
      body: { userId: 'u1', action: 'cancel' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'friend-respond', {
      body: { userId: 'u2', action: 'remove' },
    });
  });
});
