import { createHash } from 'node:crypto';
import { z } from 'zod';

// This is a portable staging archive, not a live provider export or a product importer.
const identitySchema = z.strictObject({ legacyId: z.uuid(), email: z.email(), verifiedAt: z.iso.datetime().nullable() });
const rowSchema = z.strictObject({
  id: z.string().min(1).max(200),
  ownerLegacyId: z.uuid(),
  relatedLegacyIds: z.array(z.uuid()).max(8),
  payload: z.record(z.string(), z.json()),
});
const archiveSchema = z.strictObject({
  formatVersion: z.literal(1),
  identities: z.array(identitySchema).max(10000),
  rows: z.array(rowSchema).max(100000),
});
export type LegacyArchive = z.infer<typeof archiveSchema>;
export type MigrationIdentityMapping = { legacyId: string; ownedId: string; reverificationConfirmed: boolean }[];
export type RehearsalRow = Omit<LegacyArchive['rows'][number], 'ownerLegacyId' | 'relatedLegacyIds'> & {
  ownerId: string; relatedUserIds: string[];
};
export type RehearsalState = {
  identities: Record<string, { legacyId: string; email: string; verifiedAt: string | null }>;
  rows: Record<string, RehearsalRow>;
  receipts: Record<string, string>;
};

export const emptyRehearsalState = (): RehearsalState => ({ identities: {}, rows: {}, receipts: {} });
const canonical = (value: unknown): string => {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, child]) => [key, normalize(child)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
};
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

const rejectCredentials = (value: unknown): void => {
  if (Array.isArray(value)) return value.forEach(rejectCredentials);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (/password|token|secret|credential/i.test(key)) throw new Error('Credentials and provider sessions are excluded from migration rehearsal.');
      rejectCredentials(child);
    }
  }
};

/** All validation precedes mutation; callers keep the previous state on any failure. */
export const rehearseLegacyMigration = (
  input: unknown,
  mapping: MigrationIdentityMapping,
  previous: RehearsalState = emptyRehearsalState(),
) => {
  const archive = archiveSchema.parse(input);
  rejectCredentials(archive);
  const identities = new Map<string, string>();
  const owned = new Set<string>();
  for (const item of mapping) {
    if (!z.uuid().safeParse(item.legacyId).success || !z.uuid().safeParse(item.ownedId).success
      || !item.reverificationConfirmed || identities.has(item.legacyId) || owned.has(item.ownedId)) {
      throw new Error('A confirmed one-to-one identity mapping is required.');
    }
    identities.set(item.legacyId, item.ownedId); owned.add(item.ownedId);
  }
  const sourceIds = new Set(archive.identities.map((identity) => identity.legacyId));
  if (sourceIds.size !== archive.identities.length || sourceIds.size !== identities.size
    || [...sourceIds].some((id) => !identities.has(id))) throw new Error('Every source identity must map exactly once.');
  const rowIds = new Set<string>();
  const rows: RehearsalRow[] = archive.rows.map((row) => {
    if (rowIds.has(row.id) || !sourceIds.has(row.ownerLegacyId)
      || row.relatedLegacyIds.some((id) => !sourceIds.has(id))) throw new Error('Duplicate rows or dangling account references.');
    rowIds.add(row.id);
    return { id: row.id, ownerId: identities.get(row.ownerLegacyId)!,
      relatedUserIds: row.relatedLegacyIds.map((id) => identities.get(id)!), payload: row.payload };
  });
  const sourceChecksum = digest({ identities: [...archive.identities].sort((a, b) => a.legacyId.localeCompare(b.legacyId)),
    rows: [...archive.rows].sort((a, b) => a.id.localeCompare(b.id)) });
  const mappingChecksum = digest([...mapping].sort((a, b) => a.legacyId.localeCompare(b.legacyId)));
  const receiptKey = `${sourceChecksum}:${mappingChecksum}`;
  const targetIdentities = Object.fromEntries(archive.identities.map((identity) => [identities.get(identity.legacyId)!, identity]));
  const targetChecksum = digest({ identities: targetIdentities, rows: rows.sort((a, b) => a.id.localeCompare(b.id)) });
  if (Object.prototype.hasOwnProperty.call(previous.receipts, receiptKey)) {
    if (previous.receipts[receiptKey] !== targetChecksum
      || Object.entries(targetIdentities).some(([id, identity]) => digest(previous.identities[id]) !== digest(identity))
      || rows.some((row) => digest(previous.rows[row.id]) !== digest(row))) throw new Error('Rehearsal state failed reconciliation.');
    return { state: previous, alreadyImported: true, sourceChecksum, mappingChecksum, targetChecksum,
      counts: { identities: archive.identities.length, rows: rows.length } };
  }
  const next: RehearsalState = JSON.parse(JSON.stringify(previous));
  for (const identity of archive.identities) {
    const ownedId = identities.get(identity.legacyId)!;
    if (next.identities[ownedId] && digest(next.identities[ownedId]) !== digest(identity)) throw new Error('Existing target identity conflicts with source.');
    next.identities[ownedId] = identity;
  }
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(next.rows, row.id)
      && digest(next.rows[row.id]) !== digest(row)) throw new Error('Existing target row conflicts with source.');
    // defineProperty preserves even a hostile __proto__ key as data, not a prototype setter.
    Object.defineProperty(next.rows, row.id, { value: row, enumerable: true, configurable: true, writable: true });
  }
  next.receipts[receiptKey] = targetChecksum;
  return { state: next, alreadyImported: false, sourceChecksum, mappingChecksum, targetChecksum,
    counts: { identities: archive.identities.length, rows: rows.length } };
};
