import Database from 'better-sqlite3';

import {
  acknowledgeCloudSync,
  getPendingSyncOperations,
  type CloudSyncSnapshot,
} from '../src/database/tripRepository';

let mockConnection: Database.Database;
const mockDatabase = {
  getAllSync: (sql: string, ...parameters: unknown[]) => mockConnection.prepare(sql).all(...parameters),
  runSync: (sql: string, ...parameters: unknown[]) => mockConnection.prepare(sql).run(...parameters),
  withTransactionSync: (callback: () => void) => mockConnection.transaction(callback).immediate(),
};

// Only bridge the platform API. Repository SQL and transactions execute against
// real SQLite, including constraints, null comparisons, and rollback behavior.
jest.mock('../src/database/database', () => ({ getDatabase: () => mockDatabase }));

const firstVersion = '2026-10-06T12:00:00.000Z';
const nextVersion = '2026-10-06T12:00:01.000Z';
const seedTrip = (id = 'trip-a', updatedAt = firstVersion, deletedAt: string | null = null) => {
  mockConnection.prepare(`INSERT INTO trips
    (id, local_updated_at, deleted_at, sync_status, cloud_sync_error)
    VALUES (?, ?, ?, 'pending', 'old-error')`).run(id, updatedAt, deletedAt);
};
const seedOperation = (id: string, tripId = 'trip-a', type = 'sync_trip', entityType = 'trip') => {
  mockConnection.prepare(`INSERT INTO sync_outbox
    (id, operation_type, entity_type, entity_id, payload_json, status, attempt_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`)
    .run(id, type, entityType, tripId, JSON.stringify({ tripId }), firstVersion, firstVersion);
};
const snapshot = (id = 'trip-a'): CloudSyncSnapshot => {
  const row = mockConnection.prepare('SELECT id, local_updated_at, deleted_at FROM trips WHERE id = ?')
    .get(id) as { id: string; local_updated_at: string; deleted_at: string | null };
  return { id: row.id, localUpdatedAt: row.local_updated_at, deletedAt: row.deleted_at };
};
const tripState = (id = 'trip-a') => mockConnection.prepare('SELECT * FROM trips WHERE id = ?').get(id) as {
  sync_status: string; cloud_synced_at: string | null; cloud_sync_error: string | null; deleted_at: string | null;
};
const operationState = (id: string) => (mockConnection.prepare('SELECT status FROM sync_outbox WHERE id = ?').get(id) as { status: string }).status;

describe('cloud acknowledgement compare-and-set on actual SQLite', () => {
  beforeEach(() => {
    mockConnection = new Database(':memory:');
    mockConnection.exec(`
      CREATE TABLE trips (
        id TEXT PRIMARY KEY, local_updated_at TEXT NOT NULL, deleted_at TEXT,
        cloud_synced_at TEXT, cloud_sync_error TEXT, sync_status TEXT NOT NULL
      );
      CREATE TABLE sync_outbox (
        id TEXT PRIMARY KEY, operation_type TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL, last_error TEXT, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  });

  afterEach(() => mockConnection.close());

  it('acknowledges only captured successful trip mutations and leaves unrelated work pending', async () => {
    seedTrip();
    seedTrip('trip-b');
    seedOperation('upload-a');
    seedOperation('upload-b', 'trip-b');
    seedOperation('restore-a', 'trip-a', 'restore_trips', 'account');
    const operations = await getPendingSyncOperations(null);
    await expect(acknowledgeCloudSync([snapshot()], operations)).resolves.toEqual(['trip-a']);
    expect(tripState()).toMatchObject({ sync_status: 'synced', cloud_sync_error: null });
    expect(tripState().cloud_synced_at).toEqual(expect.any(String));
    expect(operationState('upload-a')).toBe('done');
    expect(operationState('upload-b')).toBe('pending');
    expect(operationState('restore-a')).toBe('pending');
    expect(tripState('trip-b').sync_status).toBe('pending');
  });

  it('preserves a deletion during an in-flight upload; its later delete ACK supersedes the older upload', async () => {
    seedTrip();
    seedOperation('upload-a');
    const operations = await getPendingSyncOperations(null);
    const sent = snapshot();
    mockConnection.prepare("UPDATE trips SET deleted_at = ?, local_updated_at = ?, sync_status = 'pending' WHERE id = ?")
      .run(nextVersion, nextVersion, sent.id);
    seedOperation('delete-a', sent.id, 'delete_trip');
    await expect(acknowledgeCloudSync([sent], operations)).resolves.toEqual([]);
    expect(tripState()).toMatchObject({ sync_status: 'pending', deleted_at: nextVersion, cloud_synced_at: null });
    expect(operationState('upload-a')).toBe('pending');
    expect(operationState('delete-a')).toBe('pending');
    await expect(acknowledgeCloudSync([snapshot()], await getPendingSyncOperations(null))).resolves.toEqual(['trip-a']);
    expect(operationState('delete-a')).toBe('done');
    expect(operationState('upload-a')).toBe('done');
    expect(tripState().deleted_at).toBe(nextVersion);
  });

  it('preserves a newer edited row even when no additional outbox operation is supplied', async () => {
    seedTrip();
    seedOperation('upload-a');
    const sent = snapshot();
    const operations = await getPendingSyncOperations(null);
    mockConnection.prepare('UPDATE trips SET local_updated_at = ? WHERE id = ?').run(nextVersion, sent.id);
    await expect(acknowledgeCloudSync([sent], operations)).resolves.toEqual([]);
    expect(tripState().sync_status).toBe('pending');
    expect(operationState('upload-a')).toBe('pending');
  });

  it('detects an uncaptured mutation even if both writes share the same millisecond timestamp', async () => {
    seedTrip();
    seedOperation('upload-a');
    const operations = await getPendingSyncOperations(null);
    const sent = snapshot();
    seedOperation('new-upload-a');
    await expect(acknowledgeCloudSync([sent], operations)).resolves.toEqual([]);
    expect(tripState().sync_status).toBe('pending');
    expect(operationState('new-upload-a')).toBe('pending');
    await expect(acknowledgeCloudSync([snapshot()], await getPendingSyncOperations(null))).resolves.toEqual(['trip-a']);
    expect(operationState('upload-a')).toBe('done');
    expect(operationState('new-upload-a')).toBe('done');
  });

  it('does not treat an upload acknowledgement as acknowledgement of a tombstone', async () => {
    seedTrip('trip-a', firstVersion, firstVersion);
    seedOperation('upload-a');
    await expect(acknowledgeCloudSync([snapshot()], await getPendingSyncOperations(null))).resolves.toEqual([]);
    expect(tripState().sync_status).toBe('pending');
    expect(operationState('upload-a')).toBe('pending');
  });

  it('does not supersede an upload operation queued after a captured deletion', async () => {
    seedTrip('trip-a', firstVersion, firstVersion);
    seedOperation('delete-a', 'trip-a', 'delete_trip');
    seedOperation('later-upload-a');
    await expect(acknowledgeCloudSync([snapshot()], await getPendingSyncOperations(null))).resolves.toEqual([]);
    expect(operationState('delete-a')).toBe('pending');
    expect(operationState('later-upload-a')).toBe('pending');
  });

  it('rejects a changed captured operation and absent row-version metadata', async () => {
    seedTrip();
    seedOperation('upload-a');
    const operations = await getPendingSyncOperations(null);
    mockConnection.prepare('UPDATE sync_outbox SET payload_json = ? WHERE id = ?').run('{"newMutation":true}', 'upload-a');
    await expect(acknowledgeCloudSync([snapshot()], operations)).resolves.toEqual([]);
    await expect(acknowledgeCloudSync([{ id: 'trip-a', deletedAt: null }], await getPendingSyncOperations(null))).resolves.toEqual([]);
    expect(operationState('upload-a')).toBe('pending');
    expect(tripState().sync_status).toBe('pending');
  });

  it('captures and acknowledges an outbox larger than the default 25-operation preview', async () => {
    for (let index = 0; index < 30; index++) {
      seedTrip(`trip-${index}`);
      seedOperation(`operation-${index}`, `trip-${index}`);
    }
    expect(await getPendingSyncOperations()).toHaveLength(25);
    const operations = await getPendingSyncOperations(null);
    expect(operations).toHaveLength(30);
    const snapshots = operations.map((operation) => snapshot(operation.entityId));
    await expect(acknowledgeCloudSync(snapshots, operations)).resolves.toHaveLength(30);
    expect(await getPendingSyncOperations(null)).toEqual([]);
  });

  it('rolls back trip markers and every operation if any acknowledgement write fails', async () => {
    seedTrip();
    seedTrip('trip-b');
    seedOperation('upload-a');
    seedOperation('upload-b', 'trip-b');
    mockConnection.exec(`CREATE TRIGGER reject_second_ack BEFORE UPDATE ON sync_outbox
      WHEN NEW.id = 'upload-b' BEGIN SELECT RAISE(ABORT, 'acknowledgement-write-failed'); END;`);
    await expect(acknowledgeCloudSync([snapshot(), snapshot('trip-b')], await getPendingSyncOperations(null)))
      .rejects.toThrow('acknowledgement-write-failed');
    expect(tripState().sync_status).toBe('pending');
    expect(tripState('trip-b').sync_status).toBe('pending');
    expect(tripState().cloud_synced_at).toBeNull();
    expect(operationState('upload-a')).toBe('pending');
    expect(operationState('upload-b')).toBe('pending');
  });
});
