import { FunctionsClient } from '@supabase/functions-js';
import { SupabaseSyncProvider } from '../src/cloud/supabase/syncProvider';
import { getSupabaseClient } from '../src/cloud/supabase/client';
import type { CloudAuthSession } from '../src/cloud/types';
import type { TripWithSpeedSamples } from '../src/domain/trip';

jest.mock('../src/cloud/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const alice: CloudAuthSession = { userId: 'alice', email: null, accessToken: 'alice-token' };
const recording: TripWithSpeedSamples = { id: 'uploaded', startedAt: '2026-10-06',
  endedAt: '2026-10-06', totalDistanceMeters: 100, maxSpeedMps: 10,
  averageSpeedMps: 5, units: 'MPH', speedSamples: [], localUpdatedAt: '2026-10-06' };

const setup = () => {
  const fetchSpy = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: true,
    headers: { get: (name: string) => name === 'Content-Type' ? 'application/json' : null },
    json: async () => ({ syncedTripIds: ['uploaded', 'deleted', 'unsolicited'], restoredTrips: [], message: 'Done' }),
  } as Response));
  // Exercise the installed Functions SDK's header merge and actual fetch boundary;
  // the transport is synthetic and cannot contact the legacy hosted service.
  const functions = new FunctionsClient('https://synthetic.invalid/functions/v1', {
    headers: { Authorization: 'Bearer bob-token' }, customFetch: fetchSpy,
  });
  jest.mocked(getSupabaseClient).mockReturnValue({ functions } as unknown as ReturnType<typeof getSupabaseClient>);
  return { provider: new SupabaseSyncProvider(), functions, fetchSpy };
};

describe('explicit legacy sync credential binding', () => {
  it('dispatches Alice records with captured Alice credentials even when SDK auth has changed to Bob', async () => {
    const { provider, functions, fetchSpy } = setup();
    functions.setAuth('bob-token');
    const result = await provider.syncLocalChanges({ trips: [recording], deletedTripIds: ['deleted'] }, alice);
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer alice-token');
    expect(result.syncedTripIds).toEqual(['uploaded']);
    expect(result.deletedTripIds).toEqual(['deleted']);
  });

  it('binds restore requests to the captured account instead of mutable SDK auth', async () => {
    const { provider, fetchSpy } = setup();
    await provider.restoreCloudTrips(alice);
    const request = fetchSpy.mock.calls[0][1];
    expect((request?.headers as Record<string, string>).Authorization).toBe('Bearer alice-token');
    expect(JSON.parse(request?.body as string)).toMatchObject({ restoreOnly: true });
  });
});
