export type LocalStorageErrorCode =
  | 'storage_unavailable' | 'unsupported_schema' | 'migration_history_conflict'
  | 'migration_failed' | 'legacy_sequence_conflict' | 'invalid_legacy_data'
  | 'legacy_import_conflict' | 'stale_cache_scope' | 'invalid_cache_entity'
  | 'cache_revision_conflict' | 'cache_visibility_revoked' | 'cache_limit';

/** Public messages contain no database paths, SQL, payloads or underlying driver errors. */
export class LocalStorageError extends Error {
  constructor(readonly code: LocalStorageErrorCode, options?: { cause?: unknown }) {
    super(code === 'unsupported_schema'
      ? 'Local data was created by a newer app version. Update the app to continue.'
      : 'Local storage could not complete this operation. Existing data has been retained.');
    this.name = 'LocalStorageError';
    if (options?.cause !== undefined) Object.defineProperty(this, 'cause', { value: options.cause });
  }
}
