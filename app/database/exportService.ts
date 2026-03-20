import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getTrips } from './tripRepository';
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

  const payload = { preferences, trips };
  const json = JSON.stringify(payload, null, 2);
  const path = `${FileSystem.documentDirectory}v3locity_export_${timestamp()}.json`;

  await FileSystem.writeAsStringAsync(path, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(path, {
    mimeType: 'application/json',
    dialogTitle: 'Export V3locity Data',
    UTI: 'public.json',
  });
};

const escCsv = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const exportAsCsv = async (): Promise<void> => {
  const trips = await getTrips();

  const headers = [
    'ID',
    'Started At',
    'Ended At',
    'Duration (min)',
    'Distance (m)',
    'Avg Speed (m/s)',
    'Max Speed (m/s)',
    'Units',
    'Mount',
  ];

  const rows = trips.map((t) => {
    const durationMin = (
      (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) /
      60000
    ).toFixed(1);
    return [
      escCsv(t.id),
      escCsv(t.startedAt),
      escCsv(t.endedAt),
      durationMin,
      t.totalDistanceMeters.toFixed(1),
      t.averageSpeedMps.toFixed(2),
      t.maxSpeedMps.toFixed(2),
      t.units,
      escCsv(t.mountLabel ?? ''),
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const path = `${FileSystem.documentDirectory}v3locity_trips_${timestamp()}.csv`;

  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: 'Export V3locity Trips',
    UTI: 'public.comma-separated-values-text',
  });
};
