import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { declaredRoutes, profilePatchSchema } from './http';
import {
  cursorSchema, errorResponseSchema, idSchema, liveHealthSchema, paginationSchema,
  readinessHealthSchema, realtimeProtocolVersion,
} from './primitives';
import { clientRealtimeSchema, serverRealtimeSchema } from './realtime';

function schemaJson(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
    target: 'draft-2020-12', io: 'input',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema === profilePatchSchema) jsonSchema.minProperties = 1;
    },
  });
  // The runtime refinement is a JSON Schema object-cardinality invariant too.
  if (schema === profilePatchSchema) json.minProperties = 1;
  return json;
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => [key, ordered(item)]));
  }
  return value;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of declaredRoutes) {
    const parameters: Record<string, unknown>[] = [...route.path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
      name: match[1], in: 'path', required: true, schema: schemaJson(idSchema),
    }));
    if (route.paginated) {
      const shape = paginationSchema.shape;
      parameters.push({ name: 'cursor', in: 'query', schema: schemaJson(cursorSchema), required: false });
      parameters.push({ name: 'limit', in: 'query', schema: schemaJson(shape.limit), required: false });
    }
    if (route.idempotentMutation) parameters.push({
      name: 'Idempotency-Key', in: 'header', required: true, schema: schemaJson(idSchema),
      description: 'Owner-scoped durable UUID receipt; a reused key with different payload must conflict.',
    });
    const status = route.status ?? 200;
    const operation: Record<string, unknown> = {
      operationId: route.operationId, tags: [route.tag], parameters,
      'x-implementation-status': 'declared-not-mounted',
      description: 'Foundation declaration only. This product endpoint is not implemented or mounted by the telemetry server.',
      security: route.unauthenticated ? [] : [{ bearerAuth: [] }],
      responses: {
        [status]: { description: 'Declared success shape, not a runtime guarantee.', ...(route.response ? { content: { 'application/json': { schema: schemaJson(route.response) } } } : {}) },
        default: { description: 'Stable product error; never include tokens or coordinates in diagnostics.', content: { 'application/json': { schema: schemaJson(errorResponseSchema) } } },
      },
    };
    if (route.body) operation.requestBody = { required: true, content: { 'application/json': { schema: schemaJson(route.body) } } };
    if (route.operationId === 'receiveRevenueCat') {
      operation['x-webhook-authentication'] = 'Configured authorization header and optional HMAC against exact raw bytes, before accepting the vendor event.';
      operation.security = [{ webhookAuthorization: [] }];
    }
    paths[route.path] ??= {};
    if (paths[route.path][route.method]) throw new Error(`Duplicate contract: ${route.method} ${route.path}`);
    paths[route.path][route.method] = operation;
  }
  for (const [url, schema] of [['/health/live', liveHealthSchema], ['/health/ready', readinessHealthSchema]] as const) {
    paths[url] = { get: {
      operationId: url.endsWith('live') ? 'telemetryLiveness' : 'telemetryReadiness', tags: ['operations'],
      'x-implementation-status': 'telemetry-operational', security: [],
      description: 'Existing telemetry process health. It does not enable product /v2 routes.',
      responses: { 200: { description: 'Telemetry health', content: { 'application/json': { schema: schemaJson(schema) } } },
        ...(url.endsWith('ready') ? { 503: { description: 'Required telemetry dependency unavailable; product API remains disabled.' } } : {}) },
    } };
  }
  return {
    openapi: '3.1.0', jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: { title: 'V3l0city product contract declarations', version: '2.0.0-foundation',
      description: 'All /v2 operations are declared, not mounted. Legacy /v1 telemetry remains a distinct runtime. No generated contract proves authorization or feature implementation.' },
    paths, components: { securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      webhookAuthorization: { type: 'apiKey', in: 'header', name: 'Authorization' },
    } },
  };
}

export function generatedArtifacts(): Record<string, string> {
  return {
    'v2-openapi.json': stableJson(buildOpenApi()),
    'v2-realtime.schema.json': stableJson({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'V3l0city realtime declarations', protocolVersion: realtimeProtocolVersion,
      implementationStatus: 'declared-not-mounted',
      description: 'Short-lived location/reactions only; no offline replay. Authentication, trip membership, time-window, epoch and revocation require server enforcement.',
      $defs: { client: schemaJson(clientRealtimeSchema), server: schemaJson(serverRealtimeSchema) },
    }),
  };
}

export async function writeGeneratedContracts(directory: string, check = false): Promise<void> {
  if (!check) await mkdir(directory, { recursive: true });
  for (const [name, content] of Object.entries(generatedArtifacts())) {
    const destination = path.join(directory, name);
    if (check) {
      const current = await readFile(destination, 'utf8');
      if (current !== content) throw new Error(`Generated contract drift: ${name}. Run contracts:generate and review the change.`);
    } else await writeFile(destination, content, 'utf8');
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check')) throw new Error('Usage: tsx shared/contracts/generate.ts [--check]');
  writeGeneratedContracts(path.resolve(process.cwd(), 'docs/api'), args.includes('--check')).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Contract generation failed'}\n`);
    process.exitCode = 1;
  });
}
