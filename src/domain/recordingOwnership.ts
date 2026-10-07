/** Ownership is separate from the legacy Trip shape and requires explicit adoption. */
export type RecordingOwnership = {
  recordingId: string;
  ownerUserId: string | null;
  adoptionConsentAt: string | null;
};

export type LegacyRecording = { recordingId: string; legacyOwnerId: string | null };

/** Non-destructive rehearsal only: does not read credentials or alter live stores. */
export const planLegacyRecordingMigration = (
  records: readonly LegacyRecording[],
  confirmedIdentityMapping: Readonly<Record<string, string>>,
): RecordingOwnership[] => {
  const ids = new Set<string>();
  const owners = new Set<string>();
  for (const owner of Object.values(confirmedIdentityMapping)) {
    if (typeof owner !== 'string' || !owner.trim() || owners.has(owner)) throw new Error('Identity mapping must be one-to-one.');
    owners.add(owner);
  }
  return records.map((record) => {
    if (!record.recordingId.trim() || ids.has(record.recordingId)) {
      throw new Error('Recording IDs must be present and unique.');
    }
    ids.add(record.recordingId);
    return { recordingId: record.recordingId,
      ownerUserId: record.legacyOwnerId != null && Object.prototype.hasOwnProperty.call(confirmedIdentityMapping, record.legacyOwnerId)
        ? confirmedIdentityMapping[record.legacyOwnerId] ?? null : null,
      adoptionConsentAt: null };
  });
};

/** Registration or account switching must never call this implicitly. */
export const adoptPersonalRecordings = (
  records: readonly RecordingOwnership[],
  selectedIds: readonly string[],
  userId: string,
  consentAt: string,
): RecordingOwnership[] => {
  if (!userId.trim() || !Number.isFinite(Date.parse(consentAt))) throw new Error('Explicit adoption consent is required.');
  const selected = new Set(selectedIds);
  if (new Set(records.map((record) => record.recordingId)).size !== records.length) {
    throw new Error('Recording IDs must be unique.');
  }
  if (selected.size !== selectedIds.length || selectedIds.some((id) => !records.some((record) => record.recordingId === id))) {
    throw new Error('Select existing, unique personal recordings.');
  }
  for (const record of records) {
    if (selected.has(record.recordingId) && record.ownerUserId != null && record.ownerUserId !== userId) {
      throw new Error('A recording owned by another account cannot be adopted.');
    }
  }
  return records.map((record) => selected.has(record.recordingId)
    ? { ...record, ownerUserId: userId, adoptionConsentAt: consentAt } : { ...record });
};

export const canBackUpRecording = (record: RecordingOwnership | undefined, userId: string): boolean =>
  userId.trim().length > 0 && record?.ownerUserId === userId && record.adoptionConsentAt != null
  && Number.isFinite(Date.parse(record.adoptionConsentAt));
