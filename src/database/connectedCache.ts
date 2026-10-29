import { z } from 'zod';
import {
  publicUserSchema, vehicleSchema, buddyRequestSchema, crewSchema, crewMembershipSchema, meetupSchema,
  rsvpSchema, sharedTripSchema, tripMembershipSchema, waypointSchema, chatMessageSchema, entitlementSchema,
  sharedTripStateSchema, tripMembershipStateSchema, tripRoleSchema, revisionSchema, idSchema,
  syncMutationSchema, cursorSchema, utf8ByteLength,
} from '../../shared/contracts';
import { sqliteTransaction, type SqlitePort } from './sqlitePort';
import { LocalStorageError } from './storageErrors';

const scopeSchema = z.strictObject({ provider: z.enum(['owned','legacy-supabase']),userId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) });
const leaseSchema = scopeSchema.extend({ generation: revisionSchema });
export type CacheAccount = z.infer<typeof scopeSchema>;
export type CacheLease = z.infer<typeof leaseSchema>;
const schemas = {
  profile: publicUserSchema,vehicle: vehicleSchema,buddy_request: buddyRequestSchema,
  buddy: z.strictObject({ user: publicUserSchema,relationship: z.enum(['none','pending_sent','pending_received','friends','blocked']),revision: revisionSchema }),
  block: z.strictObject({ blockedId: idSchema,revision: revisionSchema }),crew: crewSchema,crew_membership: crewMembershipSchema,
  meetup: meetupSchema,rsvp: rsvpSchema,trip: sharedTripSchema,trip_membership: tripMembershipSchema,
  waypoint: waypointSchema,message: chatMessageSchema,entitlement: entitlementSchema,
  live_snapshot: z.strictObject({ tripId: idSchema,userId: idSchema,revision: revisionSchema,
    state: sharedTripStateSchema,membership: tripMembershipStateSchema,role: tripRoleSchema }),
} as const;
export type CacheEntityKind = keyof typeof schemas;
export type CachedEntity<K extends CacheEntityKind = CacheEntityKind> = { kind: K;id: string;revision: number;
  data: z.output<(typeof schemas)[K]>;expiresAtMs: number;authority: 'display-only' };
const runtimeFences = new WeakMap<SqlitePort, { known: Set<string>;invalid: Set<string> }>();
const kinds = Object.keys(schemas) as [CacheEntityKind, ...CacheEntityKind[]];
const changeSchema = z.union([
  z.strictObject({ kind: z.enum(kinds),id: z.string().min(1).max(256),revision: revisionSchema,
    data: z.unknown(),expiresAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
  z.strictObject({ kind: z.enum(kinds),id: z.string().min(1).max(256),revision: revisionSchema,deleted: z.literal(true) }),
]);
export type CacheChange = z.infer<typeof changeSchema>;
type CacheRow = { kind: CacheEntityKind;entity_id: string;parent_id: string | null;revision: number;
  payload_json: string;expires_at_ms: number;stored_at_ms: number };
type Barrier = { revision: number;is_tombstone: number };
const tripChildren = new Set<CacheEntityKind>(['trip_membership','waypoint','message','live_snapshot']);
const maxPayloadBytes = 65_536;

function valid<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new LocalStorageError('invalid_cache_entity');
  return result.data;
}
function identity(kind: CacheEntityKind, data: Record<string, unknown>): { id: string;parent: string | null;users: string[] } {
  let id = data.id as string;
  let parent: string | null = null;
  const users: unknown[] = [];
  if (kind === 'crew_membership') { id = `${data.crewId}:${data.userId}`; parent = data.crewId as string; }
  if (kind === 'trip_membership' || kind === 'live_snapshot') id = `${data.tripId}:${data.userId}`;
  if (tripChildren.has(kind)) parent = data.tripId as string;
  if (kind === 'rsvp') { id = `${data.meetupId}:${data.userId}`; parent = data.meetupId as string; }
  if (kind === 'entitlement') id = data.name as string;
  if (kind === 'buddy') { id = (data.user as Record<string, unknown>).id as string; users.push(id); }
  if (kind === 'block') { id = data.blockedId as string; users.push(id); }
  if (kind === 'profile') users.push(id);
  for (const key of ['ownerId','creatorId','hostId','authorId','requesterId','addresseeId','userId']) users.push(data[key]);
  return { id,parent,users: [...new Set(users.filter((item): item is string => typeof item === 'string'))] };
}

/** Display replicas only. No cached fact, entitlement, lease or snapshot grants server authority. */
export function createConnectedCache(database: SqlitePort, options: {
  now?: () => number; maxEntities?: number; maxBarriers?: number; maxMutations?: number; maxAccounts?: number;
} = {}) {
  const limits = { entities: options.maxEntities ?? 2000,barriers: options.maxBarriers ?? 4000,
    mutations: options.maxMutations ?? 500,accounts: options.maxAccounts ?? 32 };
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1 || value > 100_000)) throw new LocalStorageError('cache_limit');
  const now = () => valid(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), (options.now ?? Date.now)());
  const bind = (scope: CacheAccount) => [scope.provider,scope.userId] as const;
  const scopeKey = (scope: CacheAccount) => JSON.stringify(bind(scope));
  const fences = runtimeFences.get(database) ?? { known: new Set<string>(),invalid: new Set<string>() };
  runtimeFences.set(database, fences);
  function current(lease: CacheLease, allowInvalidated = false): void {
    valid(leaseSchema, lease);
    if (!allowInvalidated && fences.invalid.has(scopeKey(lease))) throw new LocalStorageError('stale_cache_scope');
    const row = database.getFirstSync<{ generation: number;active: number }>(
      'SELECT generation,active FROM connected_cache_scopes WHERE provider=? AND user_id=?', ...bind(lease));
    if (!row || row.active !== 1 || row.generation !== lease.generation) throw new LocalStorageError('stale_cache_scope');
  }
  function clearRows(scope: CacheAccount): void {
    database.runSync('DELETE FROM connected_cache_entities WHERE provider=? AND user_id=?', ...bind(scope));
    database.runSync('DELETE FROM connected_cache_sync_state WHERE provider=? AND user_id=?', ...bind(scope));
    // Durable queued edits are not disposable cache: retain them, but never dispatch across a logout.
    database.runSync("UPDATE connected_outbox SET state='blocked' WHERE provider=? AND user_id=? AND state='queued'", ...bind(scope));
  }
  function advance(lease: CacheLease, active = true): CacheLease {
    if (lease.generation >= Number.MAX_SAFE_INTEGER) throw new LocalStorageError('stale_cache_scope');
    database.runSync('UPDATE connected_cache_scopes SET generation=generation+1,active=? WHERE provider=? AND user_id=?', active ? 1 : 0,...bind(lease));
    return { ...lease,generation: lease.generation + 1 };
  }
  function barrier(scope: CacheAccount, kind: string, id: string): Barrier | null {
    return database.getFirstSync<Barrier>('SELECT revision,is_tombstone FROM connected_cache_barriers WHERE provider=? AND user_id=? AND kind=? AND entity_id=?', ...bind(scope),kind,id);
  }
  function putBarrier(scope: CacheAccount, kind: string, id: string, revision: number, tombstone = true): void {
    const old = barrier(scope, kind, id);
    if (old && (old.revision > revision || old.revision === revision && old.is_tombstone >= Number(tombstone))) return;
    if (!old && database.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM connected_cache_barriers WHERE provider=? AND user_id=?', ...bind(scope))!.count >= limits.barriers) throw new LocalStorageError('cache_limit');
    database.runSync(`INSERT INTO connected_cache_barriers(provider,user_id,kind,entity_id,revision,is_tombstone) VALUES(?,?,?,?,?,?)
      ON CONFLICT(provider,user_id,kind,entity_id) DO UPDATE SET revision=excluded.revision,is_tombstone=excluded.is_tombstone`, ...bind(scope),kind,id,revision,tombstone ? 1 : 0);
  }
  function decode(row: CacheRow) {
    if (utf8ByteLength(row.payload_json) > maxPayloadBytes || !Object.prototype.hasOwnProperty.call(schemas, row.kind)) throw new LocalStorageError('invalid_cache_entity');
    let json: unknown;
    try { json = JSON.parse(row.payload_json); } catch { throw new LocalStorageError('invalid_cache_entity'); }
    const data = valid<unknown>(schemas[row.kind], json);
    const key = identity(row.kind, data as Record<string, unknown>);
    if (key.id !== row.entity_id || key.parent !== row.parent_id) throw new LocalStorageError('invalid_cache_entity');
    return { kind: row.kind,id: row.entity_id,revision: row.revision,data,expiresAtMs: row.expires_at_ms,authority: 'display-only' as const } as CachedEntity;
  }

  const cache = {
    activate(account: CacheAccount): CacheLease {
      valid(scopeSchema, account);
      fences.known.forEach((key) => fences.invalid.add(key));
      const lease = sqliteTransaction(database, () => {
        const old = database.getFirstSync<{ generation: number }>('SELECT generation FROM connected_cache_scopes WHERE provider=? AND user_id=?', ...bind(account));
        if (old && old.generation >= Number.MAX_SAFE_INTEGER) throw new LocalStorageError('stale_cache_scope');
        if (!old && database.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM connected_cache_scopes')!.count >= limits.accounts) throw new LocalStorageError('cache_limit');
        for (const active of database.getAllSync<{ provider: CacheAccount['provider'];user_id: string;generation: number }>('SELECT provider,user_id,generation FROM connected_cache_scopes WHERE active=1')) {
          if (active.provider !== account.provider || active.user_id !== account.userId) {
            const lease = { provider: active.provider,userId: active.user_id,generation: active.generation };
            clearRows(lease); advance(lease, false);
          }
        }
        database.runSync(`INSERT INTO connected_cache_scopes(provider,user_id,generation,active) VALUES(?,?,1,1)
          ON CONFLICT(provider,user_id) DO UPDATE SET generation=generation+1,active=1`, ...bind(account));
        return { ...account,generation: (old?.generation ?? 0) + 1 };
      });
      fences.known.add(scopeKey(account)); fences.invalid.delete(scopeKey(account));
      return lease;
    },
    clear(lease: CacheLease): void {
      current(lease, true); fences.invalid.add(scopeKey(lease));
      sqliteTransaction(database, () => { current(lease, true); clearRows(lease); advance(lease, false); });
    },
    clearActive(): void {
      fences.known.forEach((key) => fences.invalid.add(key));
      sqliteTransaction(database, () => {
        for (const row of database.getAllSync<{ provider: CacheAccount['provider'];user_id: string;generation: number }>('SELECT provider,user_id,generation FROM connected_cache_scopes WHERE active=1')) {
          const lease = { provider: row.provider,userId: row.user_id,generation: row.generation };
          clearRows(lease); advance(lease, false);
        }
      });
    },
    /** Compare actual auth identity with persisted active scope, including the first observation after restart. */
    reconcile(account: CacheAccount | null): void {
      if (account) valid(scopeSchema, account);
      try {
        sqliteTransaction(database, () => {
          for (const row of database.getAllSync<{ provider: CacheAccount['provider'];user_id: string;generation: number }>('SELECT provider,user_id,generation FROM connected_cache_scopes WHERE active=1')) {
            if (account?.provider === row.provider && account.userId === row.user_id) continue;
            const lease = { provider: row.provider,userId: row.user_id,generation: row.generation };
            fences.invalid.add(scopeKey(lease)); clearRows(lease); advance(lease, false);
          }
        });
      } catch (error) {
        fences.known.forEach((key) => fences.invalid.add(key));
        throw error;
      }
    },
    apply(lease: CacheLease, changes: readonly CacheChange[], sync?: { stream: string;cursor: string }): string[] {
      const time = now();
      if (changes.length > 100) throw new LocalStorageError('invalid_cache_entity');
      const prepared = changes.map((input) => {
        const change = valid(changeSchema, input);
        if ('deleted' in change) return { change };
        const data = valid<unknown>(schemas[change.kind], change.data) as Record<string, unknown>;
        const key = identity(change.kind, data);
        const json = JSON.stringify(data);
        if (key.id !== change.id || 'revision' in data && data.revision !== change.revision
          || change.expiresAtMs <= time || utf8ByteLength(json) > maxPayloadBytes
          || change.kind === 'live_snapshot' && data.userId !== lease.userId) throw new LocalStorageError('invalid_cache_entity');
        if (change.kind === 'entitlement' && typeof data.expiresAt === 'string' && change.expiresAtMs > Date.parse(data.expiresAt)) throw new LocalStorageError('invalid_cache_entity');
        if (typeof data.deletedAt === 'string') return { change: { kind: change.kind,id: change.id,revision: change.revision,deleted: true as const } };
        return { change,data,key,json };
      });
      if (sync) { valid(z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/), sync.stream); valid(cursorSchema, sync.cursor); }
      return sqliteTransaction(database, () => {
        current(lease);
        const applied: string[] = [];
        for (const item of prepared) {
          const { change } = item;
          const old = database.getFirstSync<CacheRow>('SELECT * FROM connected_cache_entities WHERE provider=? AND user_id=? AND kind=? AND entity_id=?', ...bind(lease),change.kind,change.id);
          const fence = barrier(lease, change.kind, change.id);
          if (old && old.revision > change.revision || fence && (fence.revision > change.revision || fence.revision === change.revision && fence.is_tombstone === 1)) continue;
          if ('deleted' in change) {
            putBarrier(lease, change.kind, change.id, change.revision);
            database.runSync('DELETE FROM connected_cache_entities WHERE provider=? AND user_id=? AND kind=? AND entity_id=?', ...bind(lease),change.kind,change.id);
            if (change.kind === 'trip') {
              putBarrier(lease, '@trip', change.id, change.revision);
              database.runSync("DELETE FROM connected_cache_entities WHERE provider=? AND user_id=? AND kind IN('trip_membership','waypoint','message','live_snapshot') AND parent_id=?", ...bind(lease),change.id);
            }
          } else {
            const { key,json } = item as Required<Pick<typeof item,'key' | 'json'>>;
            const trip = change.kind === 'trip' ? change.id : tripChildren.has(change.kind) ? key.parent : null;
            if (trip && barrier(lease, '@trip', trip) || key.users.some((user) => barrier(lease, '@user', user))) continue;
            if (old?.revision === change.revision && old.payload_json !== json) throw new LocalStorageError('cache_revision_conflict');
            if (!old && database.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM connected_cache_entities WHERE provider=? AND user_id=?', ...bind(lease))!.count >= limits.entities) throw new LocalStorageError('cache_limit');
            database.runSync(`INSERT INTO connected_cache_entities(provider,user_id,kind,entity_id,parent_id,revision,payload_json,expires_at_ms,stored_at_ms)
              VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,user_id,kind,entity_id) DO UPDATE SET parent_id=excluded.parent_id,
              revision=excluded.revision,payload_json=excluded.payload_json,expires_at_ms=excluded.expires_at_ms,stored_at_ms=excluded.stored_at_ms`,
            ...bind(lease),change.kind,change.id,key.parent,change.revision,json,change.expiresAtMs,time);
            database.runSync('DELETE FROM connected_cache_references WHERE provider=? AND user_id=? AND kind=? AND entity_id=?', ...bind(lease),change.kind,change.id);
            for (const user of key.users) database.runSync('INSERT INTO connected_cache_references(provider,user_id,kind,entity_id,subject_user_id) VALUES(?,?,?,?,?)', ...bind(lease),change.kind,change.id,user);
            database.runSync('DELETE FROM connected_cache_barriers WHERE provider=? AND user_id=? AND kind=? AND entity_id=?', ...bind(lease),change.kind,change.id);
          }
          applied.push(change.id);
        }
        if (sync) database.runSync(`INSERT INTO connected_cache_sync_state(provider,user_id,stream,cursor) VALUES(?,?,?,?)
          ON CONFLICT(provider,user_id,stream) DO UPDATE SET cursor=excluded.cursor`, ...bind(lease),sync.stream,sync.cursor);
        return applied;
      });
    },
    get<K extends CacheEntityKind>(lease: CacheLease, kind: K, id: string): CachedEntity<K> | null {
      current(lease); valid(z.enum(kinds), kind); valid(z.string().min(1).max(256), id);
      const row = database.getFirstSync<CacheRow>('SELECT * FROM connected_cache_entities WHERE provider=? AND user_id=? AND kind=? AND entity_id=? AND expires_at_ms>?', ...bind(lease),kind,id,now());
      return row ? decode(row) as CachedEntity<K> : null;
    },
    list<K extends CacheEntityKind>(lease: CacheLease, kind: K, options: { parentId?: string;afterId?: string;limit?: number } = {}): CachedEntity<K>[] {
      current(lease); valid(z.enum(kinds), kind);
      const page = valid(z.strictObject({ parentId: z.string().min(1).max(256).optional(),afterId: z.string().max(256).optional(),limit: z.number().int().min(1).max(100).optional() }), options);
      const sql = page.parentId === undefined
        ? 'SELECT * FROM connected_cache_entities WHERE provider=? AND user_id=? AND kind=? AND entity_id>? AND expires_at_ms>? ORDER BY entity_id LIMIT ?'
        : 'SELECT * FROM connected_cache_entities WHERE provider=? AND user_id=? AND kind=? AND parent_id=? AND entity_id>? AND expires_at_ms>? ORDER BY entity_id LIMIT ?';
      const parameters = [...bind(lease),kind,...(page.parentId === undefined ? [] : [page.parentId]),page.afterId ?? '',now(),page.limit ?? 50];
      return database.getAllSync<CacheRow>(sql, ...parameters).map((row) => decode(row) as CachedEntity<K>);
    },
    cursor(lease: CacheLease, stream: string): string | null {
      current(lease);
      return database.getFirstSync<{ cursor: string }>('SELECT cursor FROM connected_cache_sync_state WHERE provider=? AND user_id=? AND stream=?', ...bind(lease),stream)?.cursor ?? null;
    },
    invalidate(lease: CacheLease, target: { kind: 'trip' | 'user';id: string;revision: number }): CacheLease {
      valid(z.strictObject({ kind: z.enum(['trip','user']),id: idSchema,revision: revisionSchema }), target);
      current(lease); fences.invalid.add(scopeKey(lease));
      const next = sqliteTransaction(database, () => {
        current(lease, true); putBarrier(lease, `@${target.kind}`, target.id, target.revision);
        if (target.kind === 'trip') database.runSync(`DELETE FROM connected_cache_entities WHERE provider=? AND user_id=?
          AND ((kind='trip' AND entity_id=?) OR (kind IN('trip_membership','waypoint','message','live_snapshot') AND parent_id=?))`, ...bind(lease),target.id,target.id);
        else database.runSync(`DELETE FROM connected_cache_entities WHERE provider=? AND user_id=? AND EXISTS(
          SELECT 1 FROM connected_cache_references r WHERE r.provider=connected_cache_entities.provider AND r.user_id=connected_cache_entities.user_id
          AND r.kind=connected_cache_entities.kind AND r.entity_id=connected_cache_entities.entity_id AND r.subject_user_id=?)`, ...bind(lease),target.id);
        database.runSync("UPDATE connected_outbox SET state='blocked' WHERE provider=? AND user_id=? AND state='queued'", ...bind(lease));
        return advance(lease);
      });
      fences.invalid.delete(scopeKey(lease)); return next;
    },
    /** Only a newly authenticated server fact may reopen display visibility after revocation. */
    reopen(lease: CacheLease, target: { kind: 'trip' | 'user';id: string;revision: number }): CacheLease {
      valid(z.strictObject({ kind: z.enum(['trip','user']),id: idSchema,revision: revisionSchema }), target);
      return sqliteTransaction(database, () => {
        current(lease);
        const old = barrier(lease, `@${target.kind}`, target.id);
        if (old && target.revision <= old.revision) throw new LocalStorageError('cache_visibility_revoked');
        database.runSync('DELETE FROM connected_cache_barriers WHERE provider=? AND user_id=? AND kind=? AND entity_id=?', ...bind(lease),`@${target.kind}`,target.id);
        return advance(lease);
      });
    },
    pruneExpired(lease: CacheLease): CacheLease {
      return sqliteTransaction(database, () => {
        current(lease);
        for (const row of database.getAllSync<CacheRow>('SELECT * FROM connected_cache_entities WHERE provider=? AND user_id=? AND expires_at_ms<=?', ...bind(lease),now())) {
          putBarrier(lease, row.kind, row.entity_id, row.revision, false);
          database.runSync('DELETE FROM connected_cache_entities WHERE provider=? AND user_id=? AND kind=? AND entity_id=?', ...bind(lease),row.kind,row.entity_id);
        }
        return advance(lease);
      });
    },
    enqueue(lease: CacheLease, mutation: unknown): void {
      const parsed = valid(syncMutationSchema, mutation);
      const json = JSON.stringify(parsed);
      if (utf8ByteLength(json) > maxPayloadBytes) throw new LocalStorageError('invalid_cache_entity');
      sqliteTransaction(database, () => {
        current(lease);
        const existing = database.getFirstSync<{ payload_json: string }>('SELECT payload_json FROM connected_outbox WHERE provider=? AND user_id=? AND idempotency_key=?', ...bind(lease),parsed.idempotencyKey);
        if (existing) { if (existing.payload_json !== json) throw new LocalStorageError('cache_revision_conflict'); return; }
        if (database.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM connected_outbox WHERE provider=? AND user_id=?', ...bind(lease))!.count >= limits.mutations) throw new LocalStorageError('cache_limit');
        database.runSync("INSERT INTO connected_outbox(provider,user_id,idempotency_key,generation,payload_json,state,created_at_ms) VALUES(?,?,?,?,?,'queued',?)", ...bind(lease),parsed.idempotencyKey,lease.generation,json,now());
      });
    },
  };
  return cache;
}
