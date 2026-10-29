import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { createLocalDatabaseAccess } from './sqliteMigrations';
import { importLegacyLocalStorage, type LegacyImportResult } from './legacyLocalImport';

const access = createLocalDatabaseAccess(() => SQLite.openDatabaseSync('velocity.db'));
let legacyImportResults: readonly LegacyImportResult[] = [];

/** Only a fully migrated connection is published. Initialization never deletes a database. */
export const getDatabase = (): SQLite.SQLiteDatabase => access.get();

export const getLegacyImportResults = (): readonly LegacyImportResult[] => legacyImportResults.map((result) => ({ ...result }));

/** Invalid/conflicting legacy sources stay available for recovery; healthy SQLite can still open. */
export const initDatabase = async (): Promise<void> => {
  legacyImportResults = await importLegacyLocalStorage(getDatabase(), AsyncStorage, {
    digest: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  });
};
