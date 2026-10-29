import { getDatabase } from './database';
import { createConnectedCache } from './connectedCache';
import { getCloudConfig } from '../cloud/config';

/** Auth transitions invalidate display replicas, never personal recordings or legacy outbox. */
export function invalidateActiveConnectedCache(): void {
  createConnectedCache(getDatabase()).clearActive();
}

/** Credential refresh with the same account preserves its display cache; identity loss/change clears it. */
export function reconcileConnectedCacheSession(userId: string | null): void {
  const provider = getCloudConfig().provider;
  createConnectedCache(getDatabase()).reconcile(userId && provider !== 'local' ? { provider,userId } : null);
}
