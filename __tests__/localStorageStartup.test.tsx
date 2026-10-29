import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import App from '../app/index';
import { getLegacyImportResults, initDatabase } from '../src/database/database';
import { getPreferences } from '../src/database/preferencesRepository';
import { LocalStorageError } from '../src/database/storageErrors';

jest.mock('../src/database/database', () => ({ initDatabase: jest.fn(), getLegacyImportResults: jest.fn() }));
jest.mock('../src/database/preferencesRepository', () => ({ getPreferences: jest.fn() }));
jest.mock('../src/components/speedometer', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return function MockSpeedometer() { return <MockText testID="ready-hud">HUD</MockText>; };
});
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-paper', () => ({
  ...jest.requireActual('react-native-paper'),
  Provider: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: React.PropsWithChildren) => children,
  SafeAreaView: ({ children }: React.PropsWithChildren) => children,
}));

const initialize = jest.mocked(initDatabase);
const preferences = jest.mocked(getPreferences);

describe('local storage startup', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    initialize.mockResolvedValue(undefined);
    preferences.mockResolvedValue(null);
    jest.mocked(getLegacyImportResults).mockReturnValue([]);
  });
  afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

  it('shows a recoverable storage error and allows only one pending retry', async () => {
    initialize.mockRejectedValueOnce(new Error('SQLITE_FULL'));
    await act(async () => { renderer = create(<App />); });
    expect(renderer.root.findAllByProps({ testID: 'ready-hud' })).toHaveLength(0);
    expect(renderer.root.findAllByType(Text).some((node) => node.props.children === 'Saved trips couldn’t be opened')).toBe(true);
    expect(preferences).not.toHaveBeenCalled();

    let finish!: () => void;
    initialize.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const retry = renderer.root.findByProps({ accessibilityLabel: 'Try opening saved trips again' }).props.onPress;
    await act(async () => { retry(); retry(); });
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType(Text).some((node) => node.props.children === 'Opening V3l0city')).toBe(true);
    await act(async () => finish());
    expect(renderer.root.findByProps({ testID: 'ready-hud' })).toBeTruthy();
  });

  it('does not mount a default-settings HUD when preference reads fail', async () => {
    preferences.mockRejectedValueOnce(new Error('unreadable preferences'));
    await act(async () => { renderer = create(<App />); });
    expect(renderer.root.findAllByProps({ testID: 'ready-hud' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Try opening saved trips again' }).props.accessibilityRole).toBe('button');
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Try opening saved trips again' }).props.onPress());
    expect(renderer.root.findByProps({ testID: 'ready-hud' })).toBeTruthy();
  });

  it('asks for an update when a newer schema is preserved', async () => {
    initialize.mockRejectedValueOnce(new LocalStorageError('unsupported_schema'));
    await act(async () => { renderer = create(<App />); });
    expect(renderer.root.findAllByType(Text).some((node) =>
      node.props.children === 'Your saved trips need a newer version of V3l0city. Update the app, then try again.')).toBe(true);
    expect(preferences).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ testID: 'ready-hud' })).toHaveLength(0);
  });

  it('keeps healthy SQLite usable while showing a nonblocking retained-import notice', async () => {
    jest.mocked(getLegacyImportResults).mockReturnValue([{ source: 'trips', status: 'retained', code: 'invalid_legacy_data' }]);
    await act(async () => { renderer = create(<App />); });
    expect(renderer.root.findByProps({ testID: 'ready-hud' })).toBeTruthy();
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Dismiss older data notice' }).props.onPress());
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Dismiss older data notice' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'ready-hud' })).toBeTruthy();
  });
});
