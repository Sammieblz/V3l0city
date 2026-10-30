/** Platform boundary shared by Expo SQLite and real SQLite integration fixtures. */
export type SqliteValue = string | number | null | Uint8Array;
export interface SqlitePort {
  execSync(sql: string): void;
  runSync(sql: string, ...parameters: SqliteValue[]): { changes: number; lastInsertRowId: number };
  getAllSync<T>(sql: string, ...parameters: SqliteValue[]): T[];
  getFirstSync<T>(sql: string, ...parameters: SqliteValue[]): T | null;
  withTransactionSync(task: () => void): void;
}
export interface ClosableSqlitePort extends SqlitePort { closeSync(): void }

/** Startup/cache work owns its transaction and never awaits inside the callback. */
export function sqliteTransaction<T>(database: SqlitePort, task: () => T): T {
  database.execSync('BEGIN IMMEDIATE');
  try {
    const result = task();
    database.execSync('COMMIT');
    return result;
  } catch (error) {
    try { database.execSync('ROLLBACK'); } catch { /* Keep the original failure. */ }
    throw error;
  }
}
