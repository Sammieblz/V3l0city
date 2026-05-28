import type {
  FriendProfile,
  FriendProfileDetail,
  FriendRequests,
  LeaderboardEntry,
  SocialProvider,
} from '../types';
import { getSupabaseClient } from './client';

type FriendsResponse = { users?: FriendProfile[] };
type FriendRequestsResponse = Partial<FriendRequests>;
type FriendProfileResponse = { user?: FriendProfileDetail };
type LeaderboardResponse = { entries?: LeaderboardEntry[] };

const invoke = async <T>(functionName: string, body: unknown): Promise<T> => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Cloud social features are not configured.');
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body: body as Record<string, unknown>,
  });
  if (error) throw error;
  return data as T;
};

export class SupabaseSocialProvider implements SocialProvider {
  async searchFriends(query: string): Promise<FriendProfile[]> {
    const data = await invoke<FriendsResponse>('search-friends', { query });
    return data.users ?? [];
  }

  async getNearbyUsers(coarseLocationHash: string): Promise<FriendProfile[]> {
    const data = await invoke<FriendsResponse>('nearby-users', {
      coarseLocationHash,
    });
    return data.users ?? [];
  }

  async getFriendSuggestions(): Promise<FriendProfile[]> {
    const data = await invoke<FriendsResponse>('friend-suggestions', {});
    return data.users ?? [];
  }

  async getFriendRequests(): Promise<FriendRequests> {
    const data = await invoke<FriendRequestsResponse>('friend-requests', {});
    return {
      incoming: data.incoming ?? [],
      outgoing: data.outgoing ?? [],
      friends: data.friends ?? [],
    };
  }

  async getFriendProfile(userId: string): Promise<FriendProfileDetail> {
    const data = await invoke<FriendProfileResponse>('profile-summary', {
      userId,
    });
    if (!data.user) {
      throw new Error('Profile not found.');
    }
    return data.user;
  }

  async sendFriendRequest(userId: string): Promise<void> {
    await invoke('friend-request', { userId });
  }

  async respondToFriendRequest(
    userId: string,
    action: 'accept' | 'decline' | 'cancel' | 'remove' | 'block'
  ): Promise<void> {
    await invoke('friend-respond', { userId, action });
  }

  async cancelFriendRequest(userId: string): Promise<void> {
    await this.respondToFriendRequest(userId, 'cancel');
  }

  async removeFriend(userId: string): Promise<void> {
    await this.respondToFriendRequest(userId, 'remove');
  }

  async getLeaderboards(input: {
    scope: LeaderboardEntry['scope'];
    metric: LeaderboardEntry['metric'];
    period: LeaderboardEntry['period'];
  }): Promise<LeaderboardEntry[]> {
    const data = await invoke<LeaderboardResponse>('leaderboards', input);
    return data.entries ?? [];
  }
}
