import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { exportAsCsv, exportAsJson } from '../src/database/exportService';
import { getLocalExportSnapshot } from '../src/database/tripRepository';
import { getPreferences } from '../src/database/preferencesRepository';

const mockArtifacts = new Map<string, string>();
let mockFailWrite = false;
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'test-documents' },
  File: jest.fn().mockImplementation((_: string, name: string) => ({
    uri: `test://${name}`,
    create: (options: { overwrite: boolean }) => {
      if (mockArtifacts.has(name) && !options.overwrite) throw new Error('File already exists');
      mockArtifacts.set(name, '');
    },
    write: (contents: string) => {
      if (mockFailWrite) throw new Error('Disk full');
      mockArtifacts.set(name, contents);
    },
    delete: () => mockArtifacts.delete(name),
  })),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('../src/database/tripRepository', () => ({ getLocalExportSnapshot: jest.fn(), importTripsMergeOnly: jest.fn() }));
jest.mock('../src/database/preferencesRepository', () => ({ getPreferences: jest.fn(), savePreferences: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockArtifacts.clear();
  mockFailWrite = false;
  jest.mocked(Crypto.randomUUID).mockReturnValue('00000000-0000-4000-8000-000000000001');
  jest.mocked(getPreferences).mockResolvedValue(null);
});

it.each([exportAsJson, exportAsCsv])('does not share an empty file when the local snapshot fails (%p)', async (exportData) => {
  jest.mocked(getLocalExportSnapshot).mockRejectedValueOnce(new Error('SQLITE_IOERR'));
  await expect(exportData()).rejects.toThrow('SQLITE_IOERR');
  expect(File).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

it('does not write a partial JSON export when preferences are unreadable', async () => {
  jest.mocked(getLocalExportSnapshot).mockResolvedValueOnce([]);
  jest.mocked(getPreferences).mockRejectedValueOnce(new Error('SQLITE_FULL'));
  await expect(exportAsJson()).rejects.toThrow('SQLITE_FULL');
  expect(File).not.toHaveBeenCalled();
});

it('preserves a prior export when a subsequent write fails in the same minute', async () => {
  jest.mocked(getLocalExportSnapshot).mockResolvedValue([]);
  jest.mocked(Crypto.randomUUID)
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
  await exportAsJson();
  const previousArtifacts = new Map(mockArtifacts);
  mockFailWrite = true;
  await expect(exportAsJson()).rejects.toThrow('Disk full');
  expect(mockArtifacts).toEqual(previousArtifacts);
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});
