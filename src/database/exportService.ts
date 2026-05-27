import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { buildExportPayload, buildTripsCsv } from './exportFormat';
import { getTripSpeedSamples, getTrips } from './tripRepository';
import { getPreferences } from './preferencesRepository';

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
