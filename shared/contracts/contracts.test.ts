import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildOpenApi, generatedArtifacts, writeGeneratedContracts } from './generate';
import {
  acceptsLocationSequence, backupInputSchema, chatInputSchema, coordinatesSchema, cursorSchema, decodeClientRealtime,
  errorResponseSchema, liveHealthSchema, locationUpdateSchema, membershipPatchSchema, paginationSchema,
  profilePatchSchema, realtimeProtocolVersion, registerSchema, syncChangeSchema, syncPushSchema,
  utf8ByteLength, withinTimestampWindow,
} from './index';

const id = '11111111-1111-4111-8111-111111111111';
const epoch = '22222222-2222-4222-8222-222222222222';
const location = { type: 'LOCATION_UPDATE', protocolVersion: 2, requestId: id, tripId: id,
  connectionEpoch: epoch, seq: 1, location: { latitude: 41.5, longitude: -81.6 }, heading: 90,
  speedMps: 10, accuracyMeters: 5, moving: true, clientTimestamp: '2026-10-06T12:00:00Z', privacyState: 'sharing' };

describe('strict versioned product declarations', () => {
  it('rejects authority injection, unsafe coordinates and invalid pagination', () => {
    assert.equal(membershipPatchSchema.safeParse({ ready: true, expectedRevision: 1, role: 'host' }).success, false);
    for (const point of [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: NaN, longitude: 0 }]) assert.equal(coordinatesSchema.safeParse(point).success, false);
    for (const limit of [0, 101, 1.2, Infinity]) assert.equal(paginationSchema.safeParse({ limit }).success, false);
    assert.equal(cursorSchema.safeParse('bad cursor').success, false);
    assert.equal(profilePatchSchema.safeParse({}).success, false);
    assert.equal(chatInputSchema.safeParse({ id, body: 'hello', authorId: id }).success, false);
    assert.equal(registerSchema.safeParse({ method: 'password', email: 'a@example.test', password: 'short', displayName: 'A' }).success, false);
  });

  it('bounds durable mutations and excludes live location and roles from generic sync', () => {
    const mutation = { idempotencyKey: id, operation: 'chat.send', tripId: id, payload: { id, body: 'hello' } };
    assert.equal(syncPushSchema.safeParse({ mutations: [mutation] }).success, true);
    assert.equal(syncPushSchema.safeParse({ mutations: Array(51).fill(mutation) }).success, false);
    assert.equal(syncPushSchema.safeParse({ mutations: [{ ...mutation, operation: 'location.update' }] }).success, false);
    assert.equal(syncPushSchema.safeParse({ mutations: [{ ...mutation, operation: 'membership.promote' }] }).success, false);
    assert.equal(syncChangeSchema.safeParse({ cursor: 'abc_1', entityId: id, revision: 2, entityType: 'tombstone', deletedEntityType: 'message', deletedAt: '2026-10-06T12:00:00Z' }).success, true);
  });

  it('preserves stable redacted error and operational health shapes', () => {
    assert.equal(errorResponseSchema.safeParse({ code: 'FORBIDDEN', message: 'Not permitted', requestId: 'req-1' }).success, true);
    assert.equal(errorResponseSchema.safeParse({ code: 'RAW_SQL_ERROR', message: 'bad', requestId: 'req-1', token: 'secret' }).success, false);
    assert.equal(liveHealthSchema.safeParse({ status: 'live', service: 'telemetry', apiVersions: [1], productApiEnabled: false }).success, true);
    assert.equal(liveHealthSchema.safeParse({ status: 'live', service: 'telemetry', apiVersions: [2], productApiEnabled: true }).success, false);
  });

  it('preserves existing personal recording IDs while keeping owned backup identities UUIDs', () => {
    const legacyId = '1728150645123';
    const input = { id, localTripId: legacyId, mediaObjectId: id, formatVersion: 1, consent: 'backup_personal_recording' };
    assert.equal(backupInputSchema.parse(input).localTripId, legacyId);
    assert.equal(backupInputSchema.safeParse({ ...input, id: legacyId }).success, false);
    for (const localTripId of ['', 'x'.repeat(129)]) assert.equal(backupInputSchema.safeParse({ ...input, localTripId }).success, false);
    assert.equal(backupInputSchema.safeParse({ ...input, ownerId: id }).success, false);
  });
});

describe('realtime bounds, epochs and time policy', () => {
  it('rejects wrong version, authority fields, paused coordinates and malformed frames', () => {
    assert.equal(locationUpdateSchema.safeParse(location).success, true);
    assert.equal(locationUpdateSchema.safeParse({ ...location, privacyState: 'paused' }).success, false);
    assert.equal(locationUpdateSchema.safeParse({ ...location, memberId: id }).success, false);
    assert.deepEqual(decodeClientRealtime(JSON.stringify({ ...location, protocolVersion: 1 })), { ok: false, code: 'UNSUPPORTED_VERSION' });
    assert.deepEqual(decodeClientRealtime('{'), { ok: false, code: 'BAD_REQUEST' });
    assert.deepEqual(decodeClientRealtime(null), { ok: false, code: 'BAD_REQUEST' });
    assert.deepEqual(decodeClientRealtime(new Uint8Array()), { ok: false, code: 'BAD_REQUEST' });
    assert.deepEqual(decodeClientRealtime('x'.repeat(8_193)), { ok: false, code: 'FRAME_TOO_LARGE' });
    assert.deepEqual(decodeClientRealtime('😀'.repeat(2_049)), { ok: false, code: 'FRAME_TOO_LARGE' });
    assert.equal(utf8ByteLength('aé😀'), Buffer.byteLength('aé😀'));
  });

  it('requires increasing sequence within the authenticated epoch, not a gapless fiction', () => {
    const current = { connectionEpoch: epoch, lastSequence: 5 };
    assert.equal(acceptsLocationSequence(current, { connectionEpoch: epoch, seq: 6 }), true);
    assert.equal(acceptsLocationSequence(current, { connectionEpoch: epoch, seq: 8 }), true);
    for (const seq of [5, 1, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(acceptsLocationSequence(current, { connectionEpoch: epoch, seq }), false);
    assert.equal(acceptsLocationSequence(current, { connectionEpoch: id, seq: 1 }), false);
    assert.equal(realtimeProtocolVersion, 2);
  });

  it('requires explicitly supplied measured time policy', () => {
    const now = Date.parse('2026-10-06T12:00:00Z');
    const policy = { maxPastAgeMs: 1_000, maxFutureSkewMs: 100 };
    assert.equal(withinTimestampWindow('2026-10-06T12:00:00Z', now, policy), true);
    assert.equal(withinTimestampWindow('2026-10-06T11:59:58Z', now, policy), false);
    assert.equal(withinTimestampWindow('2026-10-06T12:00:01Z', now, policy), false);
    assert.equal(withinTimestampWindow('bad', now, policy), false);
  });
});

describe('reproducible contract generation', () => {
  it('marks every product route unimplemented and keeps operational health separate', () => {
    const document = buildOpenApi() as { paths: Record<string, Record<string, { 'x-implementation-status': string }>> };
    assert.ok(Object.keys(document.paths).length > 40);
    for (const [url, methods] of Object.entries(document.paths)) for (const operation of Object.values(methods)) {
      assert.equal(operation['x-implementation-status'], url.startsWith('/v2/') ? 'declared-not-mounted' : 'telemetry-operational');
    }
    assert.deepEqual(generatedArtifacts(), generatedArtifacts());
  });

  it('detects changed generated output rather than silently replacing it in check mode', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'v3l0city-contract-'));
    try {
      await writeGeneratedContracts(directory);
      await writeGeneratedContracts(directory, true);
      const output = path.join(directory, 'v2-openapi.json');
      await writeFile(output, `${await readFile(output, 'utf8')} `);
      await assert.rejects(writeGeneratedContracts(directory, true), /Generated contract drift/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
