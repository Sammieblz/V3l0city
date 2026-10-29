import { mkdtempSync,rmSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnectedCache,type CacheChange,type CacheLease } from '../src/database/connectedCache';
import { createRecordingOwnershipRepository } from '../src/database/recordingOwnershipRepository';
import { migrateLocalDatabase } from '../src/database/sqliteMigrations';
import { realSqlite,historicalPersonalSchema,snapshotPersonal } from '../test-support/sqliteFixture';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const tripId = '33333333-3333-4333-8333-333333333333';
const messageId = '44444444-4444-4444-8444-444444444444';
const nextId = '55555555-5555-4555-8555-555555555555';
const scope = { provider:'owned' as const,userId:alice };
const startedAt = '2026-10-28T12:00:00Z';
const profile = (id = bob,revision = 1): CacheChange => ({ kind:'profile',id,revision,expiresAtMs:2000,
  data:{ id,handle:'driver',displayName:'Driver',avatarUrl:null,revision } });
const message = (id = messageId,revision = 1): CacheChange => ({ kind:'message',id,revision,expiresAtMs:2000,
  data:{ id,body:'Hello',tripId,authorId:bob,kind:'user',createdAt:startedAt,revision,deletedAt:null } });
const trip = (revision = 1): CacheChange => ({ kind:'trip',id:tripId,revision,expiresAtMs:2000,
  data:{ id:tripId,hostId:alice,title:'Shared trip',scheduledAt:null,visibility:'invite_only',crewId:null,
    route:{ destination:null,provider:'mapbox',routeReference:null,revision:1 },state:'active',startedAt,endedAt:null,revision } });
const mutation = { idempotencyKey:messageId,operation:'chat.send',tripId,payload:{ id:messageId,body:'Queued message' } };
function expectCode(task: () => unknown, code: string) {
  try { task();throw new Error('Expected cache operation to fail.'); }
  catch(error) { expect(error).toMatchObject({ code }); }
}

test('logout and provider/account switches preserve every personal field, ownership and legacy mutation', () => {
  const { connection,port } = realSqlite();
  try {
    historicalPersonalSchema(port,{ latest:true });
    const personal = snapshotPersonal(connection);
    migrateLocalDatabase(port);
    const ownership = createRecordingOwnershipRepository(port);
    expect(ownership.canUpload(scope,'personal-completed')).toBe(false);
    ownership.adopt(scope,['personal-completed'],startedAt);
    const cache = createConnectedCache(port,{ now:()=>1000 });
    const lease = cache.activate(scope);
    cache.apply(lease,[profile(),trip(),message()],{ stream:'main',cursor:'cursor_1' });
    cache.enqueue(lease,mutation);
    cache.clear(lease);
    expectCode(()=>cache.get(lease,'profile',bob),'stale_cache_scope');
    expectCode(()=>cache.apply(lease,[profile()]),'stale_cache_scope');
    expect(connection.prepare('SELECT COUNT(*) AS count FROM connected_cache_entities').get()).toEqual({ count:0 });
    expect(connection.prepare('SELECT COUNT(*) AS count FROM connected_cache_sync_state').get()).toEqual({ count:0 });
    expect(connection.prepare('SELECT state FROM connected_outbox').get()).toEqual({ state:'blocked' });
    expect(ownership.canUpload(scope,'personal-completed')).toBe(true);
    expect(ownership.canUpload({ provider:'owned',userId:bob },'personal-completed')).toBe(false);
    expect(ownership.canUpload({ provider:'legacy-supabase',userId:alice },'personal-completed')).toBe(false);
    const other = cache.activate({ provider:'legacy-supabase',userId:alice });
    expect(cache.get(other,'profile',bob)).toBeNull();
    cache.apply(other,[profile()]);
    const next = cache.activate({ provider:'owned',userId:bob });
    expectCode(()=>cache.get(other,'profile',bob),'stale_cache_scope');
    expect(cache.get(next,'profile',bob)).toBeNull();
    expect(personal.read()).toEqual(personal.before);
    expect(connection.pragma('foreign_key_check')).toEqual([]);
  } finally { connection.close(); }
});

test('typed entities reject credentials, publication grants, oversized values and injected identity', () => {
  const { connection,port } = realSqlite();migrateLocalDatabase(port);
  try {
    const cache = createConnectedCache(port,{ now:()=>1000 });const lease=cache.activate(scope);
    for (const change of [
      { ...profile(),data:{ ...(profile() as {data:object}).data,accessToken:'private-token' } },
      { ...profile(),data:{ ...(profile() as {data:object}).data,displayName:'x'.repeat(81) } },
      { ...profile(),id:alice },
      { kind:'live_snapshot',id:`${tripId}:${alice}`,revision:1,expiresAtMs:2000,
        data:{ tripId,userId:alice,revision:1,state:'active',membership:'joined',role:'host',sharingGrant:{ token:'private-grant' } } },
      { ...profile(),expiresAtMs:1000 },
    ]) expectCode(()=>cache.apply(lease,[change as CacheChange]),'invalid_cache_entity');
    expect(connection.prepare('SELECT COUNT(*) AS count FROM connected_cache_entities').get()).toEqual({ count:0 });
    cache.apply(lease,[{ kind:'live_snapshot',id:`${tripId}:${alice}`,revision:1,expiresAtMs:2000,
      data:{ tripId,userId:alice,revision:1,state:'active',membership:'joined',role:'host' } }]);
    const snapshot = cache.get(lease,'live_snapshot',`${tripId}:${alice}`);
    expect(snapshot?.authority).toBe('display-only');
    expect(snapshot?.data).not.toHaveProperty('sharingGrant');
    expect(snapshot).not.toHaveProperty('accessToken');
  } finally { connection.close(); }
});

test('revision ordering, immutable same-revision values and cursor writes share one transaction', () => {
  const { connection,port } = realSqlite();migrateLocalDatabase(port);
  try {
    const cache=createConnectedCache(port,{ now:()=>1000 });const lease=cache.activate(scope);
    cache.apply(lease,[profile(bob,2)],{ stream:'main',cursor:'cursor_1' });
    expect(cache.apply(lease,[profile(bob,1)])).toEqual([]);
    expect(cache.get(lease,'profile',bob)?.revision).toBe(2);
    expect(cache.apply(lease,[profile(bob,2)])).toEqual([bob]);
    const conflict={ ...profile(bob,2),data:{ ...(profile(bob,2) as {data:object}).data,displayName:'Changed at same revision' } };
    expectCode(()=>cache.apply(lease,[profile(nextId),conflict],{ stream:'main',cursor:'cursor_2' }),'cache_revision_conflict');
    expect(cache.get(lease,'profile',nextId)).toBeNull();
    expect(cache.cursor(lease,'main')).toBe('cursor_1');
    connection.exec(`CREATE TRIGGER fail_cache_write BEFORE INSERT ON connected_cache_entities
      WHEN NEW.entity_id='${nextId}' BEGIN SELECT RAISE(ABORT,'synthetic-cache-failure'); END;`);
    let error:unknown;
    try { cache.apply(lease,[profile(alice),profile(nextId)],{ stream:'main',cursor:'cursor_3' }); } catch(caught) { error=caught; }
    expect(error).toMatchObject({ code:'SQLITE_CONSTRAINT_TRIGGER',message:'synthetic-cache-failure' });
    expect(cache.get(lease,'profile',alice)).toBeNull();
    expect(cache.cursor(lease,'main')).toBe('cursor_1');
    cache.apply(lease,[message()]);
    cache.apply(lease,[{ ...message(messageId,2),data:{ ...(message(messageId,2) as {data:object}).data,deletedAt:startedAt } }]);
    expect(cache.get(lease,'message',messageId)).toBeNull();
    expect(cache.apply(lease,[message(messageId,2)])).toEqual([]);
  } finally { connection.close(); }
});

test('trip tombstones remove children and block stale pages without touching personal history', () => {
  const { connection,port }=realSqlite();historicalPersonalSchema(port,{ latest:true });migrateLocalDatabase(port);
  try {
    const personal=snapshotPersonal(connection);const cache=createConnectedCache(port,{ now:()=>1000 });const lease=cache.activate(scope);
    cache.apply(lease,[trip(),message()]);
    cache.apply(lease,[{ kind:'trip',id:tripId,revision:2,deleted:true }]);
    expect(cache.get(lease,'trip',tripId)).toBeNull();
    expect(cache.list(lease,'message',{ parentId:tripId })).toEqual([]);
    expect(cache.apply(lease,[trip(1),message(nextId,99)])).toEqual([]);
    expect(cache.get(lease,'message',nextId)).toBeNull();
    expectCode(()=>cache.reopen(lease,{ kind:'trip',id:tripId,revision:2 }),'cache_visibility_revoked');
    const allowed=cache.reopen(lease,{ kind:'trip',id:tripId,revision:3 });
    expectCode(()=>cache.apply(lease,[trip(3)]),'stale_cache_scope');
    cache.apply(allowed,[trip(3),message(nextId,2)]);
    expect(cache.get(allowed,'message',nextId)?.data.body).toBe('Hello');
    expect(personal.read()).toEqual(personal.before);
  } finally { connection.close(); }
});

test('block/membership visibility invalidation is durable, revision-fenced and cannot replay through a new cache instance', () => {
  const directory=mkdtempSync(join(tmpdir(),'v3l0city-cache-reopen-'));const path=join(directory,'fixture.sqlite');
  const first=realSqlite(path);migrateLocalDatabase(first.port);
  let lease:CacheLease;
  try {
    const cache=createConnectedCache(first.port,{ now:()=>1000 });lease=cache.activate(scope);
    cache.apply(lease,[profile(),trip(),message()]);
    const blocked=cache.invalidate(lease,{ kind:'user',id:bob,revision:2 });
    expectCode(()=>cache.get(lease,'message',messageId),'stale_cache_scope');
    expect(cache.get(blocked,'profile',bob)).toBeNull();
    expect(cache.get(blocked,'message',messageId)).toBeNull();
    expect(cache.apply(blocked,[profile(bob,100),message(nextId,100)])).toEqual([]);
  } finally { first.connection.close(); }
  const second=realSqlite(path);
  try {
    migrateLocalDatabase(second.port);const cache=createConnectedCache(second.port,{ now:()=>1000 });const fresh=cache.activate(scope);
    expectCode(()=>cache.apply(lease!,[profile()]),'stale_cache_scope');
    expect(cache.apply(fresh,[profile(bob,100)])).toEqual([]);
    const left=cache.invalidate(fresh,{ kind:'trip',id:tripId,revision:5 });
    expect(cache.get(left,'trip',tripId)).toBeNull();
    expect(cache.apply(left,[message(nextId,101)])).toEqual([]);
    expectCode(()=>cache.reopen(left,{ kind:'user',id:bob,revision:2 }),'cache_visibility_revoked');
  } finally { second.connection.close();rmSync(path);rmdirSync(directory); }
});

test('expired payloads are removed behind a new generation and lower revisions cannot return', () => {
  const {connection,port}=realSqlite();migrateLocalDatabase(port);
  try {
    let time=1000;const cache=createConnectedCache(port,{ now:()=>time });const lease=cache.activate(scope);
    cache.apply(lease,[profile(bob,3),{ kind:'entitlement',id:'v3l0city_plus',revision:1,expiresAtMs:2000,
      data:{ name:'v3l0city_plus',active:true,expiresAt:'2026-10-29T00:00:00Z',checkedAt:startedAt } }]);
    time=2000;
    expect(cache.get(lease,'profile',bob)).toBeNull();
    expect(cache.get(lease,'entitlement','v3l0city_plus')).toBeNull();
    const refreshed=cache.pruneExpired(lease);
    expectCode(()=>cache.apply(lease,[{ ...profile(bob,3),expiresAtMs:3000 }]),'stale_cache_scope');
    expect(connection.prepare('SELECT COUNT(*) AS count FROM connected_cache_entities').get()).toEqual({ count:0 });
    expect(cache.apply(refreshed,[{ ...profile(bob,2),expiresAtMs:3000 }])).toEqual([]);
    expect(cache.apply(refreshed,[{ ...profile(bob,3),expiresAtMs:3000 }])).toEqual([bob]);
    expect(cache.get(refreshed,'profile',bob)?.authority).toBe('display-only');
  } finally { connection.close(); }
});

test('cache/outbox limits preserve previous data, idempotency and strict allowed mutation types', () => {
  const {connection,port}=realSqlite();migrateLocalDatabase(port);
  try {
    const cache=createConnectedCache(port,{ now:()=>1000,maxEntities:1,maxMutations:1 });const lease=cache.activate(scope);
    cache.apply(lease,[profile()]);
    expectCode(()=>cache.apply(lease,[profile(alice)],{ stream:'main',cursor:'uncommitted' }),'cache_limit');
    expect(cache.get(lease,'profile',bob)).not.toBeNull();expect(cache.cursor(lease,'main')).toBeNull();
    cache.enqueue(lease,mutation);cache.enqueue(lease,mutation);
    expectCode(()=>cache.enqueue(lease,{ ...mutation,payload:{id:messageId,body:'Changed'} }),'cache_revision_conflict');
    expectCode(()=>cache.enqueue(lease,{ ...mutation,idempotencyKey:nextId }),'cache_limit');
    for(const operation of ['location.update','membership.promote','reaction.send']) expectCode(()=>cache.enqueue(lease,{ ...mutation,operation }),'invalid_cache_entity');
    expect(connection.prepare('SELECT COUNT(*) AS count FROM connected_outbox').get()).toEqual({count:1});
  } finally {connection.close();}
});

test('representative indexed chat pagination and expiry cleanup avoid cross-account rows', () => {
  const {connection,port}=realSqlite();migrateLocalDatabase(port);
  try {
    const cache=createConnectedCache(port,{ now:()=>1000 });const lease=cache.activate(scope);
    for(let batch=0;batch<10;batch++) {
      const changes=Array.from({length:100},(_,index)=>{
        const ordinal=batch*100+index+1;
        const suffix=ordinal.toString(16).padStart(12,'0');
        return {...message(`99999999-9999-4999-8999-${suffix}`),expiresAtMs:ordinal<=20?2000:100000};
      });cache.apply(lease,changes);
    }
    connection.prepare('INSERT INTO connected_cache_scopes(provider,user_id,generation,active) VALUES(?,?,1,0)').run('owned',bob);
    connection.prepare(`INSERT INTO connected_cache_entities(provider,user_id,kind,entity_id,parent_id,revision,payload_json,expires_at_ms,stored_at_ms)
      SELECT provider,?,kind,entity_id,parent_id,revision,replace(payload_json,'Hello','Other account'),expires_at_ms,stored_at_ms
      FROM connected_cache_entities WHERE provider=? AND user_id=?`).run(bob,'owned',alice);
    connection.exec('ANALYZE');
    const rows=cache.list(lease,'message',{parentId:tripId,limit:20});
    expect(rows).toHaveLength(20);expect(new Set(rows.map(row=>row.id)).size).toBe(20);
    expect(rows.every(row=>row.data.body==='Hello')).toBe(true);
    const next=cache.list(lease,'message',{parentId:tripId,afterId:rows[19].id,limit:20});
    expect(next).toHaveLength(20);expect(next[0].id>rows[19].id).toBe(true);
    const plan=connection.prepare(`EXPLAIN QUERY PLAN SELECT * FROM connected_cache_entities
      WHERE provider=? AND user_id=? AND kind=? AND parent_id=? AND entity_id>? AND expires_at_ms>?
      ORDER BY entity_id LIMIT ?`).all(scope.provider,alice,'message',tripId,'',1000,20) as {detail:string}[];
    expect(plan.map(row=>row.detail).join(' ')).toContain('idx_connected_cache_parent');
    expect(plan.map(row=>row.detail).join(' ')).not.toContain('USE TEMP B-TREE');
    const expiry=connection.prepare('EXPLAIN QUERY PLAN SELECT * FROM connected_cache_entities WHERE provider=? AND user_id=? AND expires_at_ms<=?')
      .all(scope.provider,alice,2000) as {detail:string}[];
    expect(expiry.map(row=>row.detail).join(' ')).toContain('idx_connected_cache_expiry');
  } finally {connection.close();}
});

test('ownership adoption is explicit and atomic; missing/other-provider selections never reassign recordings', () => {
  const {connection,port}=realSqlite();historicalPersonalSchema(port,{latest:true});migrateLocalDatabase(port);
  try {
    const repository=createRecordingOwnershipRepository(port);
    repository.adopt(scope,['personal-completed'],startedAt);
    expectCode(()=>repository.adopt({provider:'legacy-supabase',userId:alice},['personal-deleted','personal-completed'],startedAt),'legacy_import_conflict');
    expect(repository.get('personal-deleted')?.ownerUserId).toBeNull();
    expect(repository.get('personal-completed')).toMatchObject({ownerProvider:'owned',ownerUserId:alice,adoptionConsentAt:startedAt});
    expectCode(()=>repository.adopt(scope,['personal-deleted','missing'],startedAt),'legacy_import_conflict');
    expect(repository.get('personal-deleted')?.ownerUserId).toBeNull();
    createConnectedCache(port).clearActive();
    expect(repository.canUpload(scope,'personal-completed')).toBe(true);
    expect(repository.canUpload(scope,'personal-deleted')).toBe(false);
  } finally {connection.close();}
});
