import { getPreferences } from '../src/database/preferencesRepository';

const mockRead = jest.fn();
jest.mock('../src/database/database', () => ({ getDatabase: () => ({ getFirstSync: mockRead }) }));

it('distinguishes a missing preferences row from an unreadable database', async () => {
  mockRead.mockReturnValueOnce(null);
  await expect(getPreferences()).resolves.toBeNull();
  mockRead.mockImplementationOnce(() => { throw new Error('SQLITE_IOERR'); });
  await expect(getPreferences()).rejects.toThrow('SQLITE_IOERR');
});
