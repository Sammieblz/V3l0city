import { z } from 'zod';
import type { CacheAccount } from './connectedCache';
import { sqliteTransaction, type SqlitePort } from './sqlitePort';
import { LocalStorageError } from './storageErrors';

export type PersistedRecordingOwnership = { recordingId: string;ownerProvider: CacheAccount['provider'] | null;
  ownerUserId: string | null;adoptionConsentAt: string | null };
const accountSchema = z.strictObject({ provider: z.enum(['owned','legacy-supabase']),userId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) });

/** Persistence only. The production cloud facade still uses its deny-by-default adoption port. */
export function createRecordingOwnershipRepository(database: SqlitePort) {
  const repository = {
    get(recordingId: string): PersistedRecordingOwnership | null {
      const row = database.getFirstSync<{ owner_provider: PersistedRecordingOwnership['ownerProvider'];owner_user_id: string | null;adoption_consent_at: string | null }>(
        'SELECT owner_provider,owner_user_id,adoption_consent_at FROM recording_ownership WHERE recording_id=?', recordingId);
      if (row) return { recordingId,ownerProvider: row.owner_provider,ownerUserId: row.owner_user_id,adoptionConsentAt: row.adoption_consent_at };
      return database.getFirstSync('SELECT id FROM trips WHERE id=?', recordingId)
        ? { recordingId,ownerProvider: null,ownerUserId: null,adoptionConsentAt: null } : null;
    },
    adopt(account: CacheAccount, selectedIds: readonly string[], consentAt: string): void {
      if (!accountSchema.safeParse(account).success || !z.string().datetime({ offset: true }).safeParse(consentAt).success
        || selectedIds.length < 1 || selectedIds.length > 1000 || new Set(selectedIds).size !== selectedIds.length
        || selectedIds.some((id) => typeof id !== 'string' || !id.trim())) throw new LocalStorageError('invalid_legacy_data');
      sqliteTransaction(database, () => {
        for (const id of selectedIds) {
          const current = repository.get(id);
          if (!current || current.ownerUserId !== null && (current.ownerProvider !== account.provider || current.ownerUserId !== account.userId)) {
            throw new LocalStorageError('legacy_import_conflict');
          }
        }
        for (const id of selectedIds) database.runSync(`INSERT INTO recording_ownership(recording_id,owner_provider,owner_user_id,adoption_consent_at)
          VALUES(?,?,?,?) ON CONFLICT(recording_id) DO UPDATE SET owner_provider=excluded.owner_provider,
          owner_user_id=excluded.owner_user_id,adoption_consent_at=excluded.adoption_consent_at`, id,account.provider,account.userId,consentAt);
      });
    },
    canUpload(account: CacheAccount, recordingId: string): boolean {
      if (!accountSchema.safeParse(account).success) return false;
      const owner = repository.get(recordingId);
      return owner?.ownerProvider === account.provider && owner.ownerUserId === account.userId
        && owner.adoptionConsentAt !== null && Number.isFinite(Date.parse(owner.adoptionConsentAt));
    },
  };
  return repository;
}
