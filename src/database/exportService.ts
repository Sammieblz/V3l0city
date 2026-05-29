import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import {
  buildExportPayload,
  buildTripsCsv,
  parseExportPayload,
  previewImportPayload,
  type ImportPreview,
} from './exportFormat';
import {
  getTripSpeedSamples,
  getTrips,
  importTripsMergeOnly,
  type ImportTripsMergeResult,
} from './tripRepository';
import { getPreferences, savePreferences } from './preferencesRepository';

export { previewImportPayload } from './exportFormat';

export type JsonImportResult = ImportPreview &
  ImportTripsMergeResult & {
    preferencesRestored: boolean;
    message: string;
  };

const timestamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
};

export const exportAsJson = async (): Promise<void> => {
  const [preferences, trips] = await Promise.all([
    getPreferences(),
    getTrips(),
  ]);
  const tripsWithSamples = await Promise.all(
    trips.map(async (trip) => ({
      ...trip,
      speedSamples: await getTripSpeedSamples(trip.id),
    }))
  );

  const payload = buildExportPayload(preferences, tripsWithSamples);
  const json = JSON.stringify(payload, null, 2);
  const file = new File(Paths.document, `v3l0city_export_${timestamp()}.json`);

  file.create({ overwrite: true });
  file.write(json, { encoding: 'utf8' });

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export V3l0city Data',
    UTI: 'public.json',
  });
};

export const exportAsCsv = async (): Promise<void> => {
  const trips = await getTrips();
  const tripSamples = await Promise.all(
    trips.map(async (trip) => ({
      tripId: trip.id,
      samples: await getTripSpeedSamples(trip.id),
    }))
  );

  const csv = buildTripsCsv(trips, tripSamples);
  const file = new File(Paths.document, `v3l0city_trips_${timestamp()}.csv`);

  file.create({ overwrite: true });
  file.write(csv, { encoding: 'utf8' });

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export V3l0city Trips',
    UTI: 'public.comma-separated-values-text',
  });
};

export const importExportPayload = async (
  rawPayload: unknown
): Promise<JsonImportResult> => {
  const payload = parseExportPayload(rawPayload);
  const preview = previewImportPayload(payload);
  const importResult = await importTripsMergeOnly(payload.trips);
  if (payload.preferences) {
    await savePreferences(payload.preferences);
  }

  const preferencesText = payload.preferences ? ' Preferences restored.' : '';
  return {
    ...preview,
    ...importResult,
    preferencesRestored: payload.preferences != null,
    message:
      `Imported ${importResult.tripsImported} trip${
        importResult.tripsImported === 1 ? '' : 's'
      } and ${importResult.samplesImported} sample${
        importResult.samplesImported === 1 ? '' : 's'
      }. Skipped ${importResult.tripsSkipped} existing trip${
        importResult.tripsSkipped === 1 ? '' : 's'
      }.${preferencesText}`,
  };
};

export const pickAndImportJsonExport =
  async (): Promise<JsonImportResult | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/json', 'text/plain'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    const file = new File(result.assets[0].uri);
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Choose a V3l0city JSON export file.');
    }

    return importExportPayload(parsed);
  };
