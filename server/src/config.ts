import { z } from 'zod';

const integer = (fallback: number, min: number, max: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max)).default(fallback);

const environmentSchema = z.object({
  V3L0CITY_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  HOST: z.string().trim().min(1).max(255).default('0.0.0.0'),
  PORT: integer(8787, 1, 65535),
  V3L0CITY_SERVER_DB: z.string().trim().min(1).default('server/data/v3l0city.sqlite'),
  V3L0CITY_PUBLIC_WS_URL: z.url().optional(),
  SHUTDOWN_TIMEOUT_MS: integer(10000, 1, 300000),
}).superRefine((env, context) => {
  const deployed = env.V3L0CITY_ENV === 'staging' || env.V3L0CITY_ENV === 'production';
  if (deployed && env.V3L0CITY_SERVER_DB === ':memory:') {
    context.addIssue({ code: 'custom', path: ['V3L0CITY_SERVER_DB'], message: 'A persistent database path is required.' });
  }
  if (deployed && !env.V3L0CITY_PUBLIC_WS_URL) {
    context.addIssue({ code: 'custom', path: ['V3L0CITY_PUBLIC_WS_URL'], message: 'A public secure WebSocket origin is required.' });
  }
  if (env.V3L0CITY_PUBLIC_WS_URL) {
    const url = new URL(env.V3L0CITY_PUBLIC_WS_URL);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      context.addIssue({ code: 'custom', path: ['V3L0CITY_PUBLIC_WS_URL'], message: 'Use a ws/wss origin without credentials, path, query or fragment.' });
    }
    if (deployed && url.protocol !== 'wss:') {
      context.addIssue({ code: 'custom', path: ['V3L0CITY_PUBLIC_WS_URL'], message: 'Staging and production require wss.' });
    }
  }
});

export type RuntimeConfig = {
  environment: 'development' | 'test' | 'staging' | 'production';
  host: string;
  port: number;
  dbPath: string;
  publicWsUrl?: string;
  shutdownTimeoutMs: number;
};

export class ConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    super(`Invalid server configuration: ${fields.join(', ')}.`);
    this.name = 'ConfigurationError';
  }
}

export const loadRuntimeConfig = (env: Readonly<Record<string, string | undefined>> = process.env): RuntimeConfig => {
  const parsed = environmentSchema.safeParse({
    V3L0CITY_ENV: env.V3L0CITY_ENV ?? (env.NODE_ENV === 'production' ? 'production' : undefined),
    HOST: env.HOST,
    PORT: env.PORT,
    V3L0CITY_SERVER_DB: env.V3L0CITY_SERVER_DB,
    V3L0CITY_PUBLIC_WS_URL: env.V3L0CITY_PUBLIC_WS_URL,
    SHUTDOWN_TIMEOUT_MS: env.SHUTDOWN_TIMEOUT_MS,
  });
  if (!parsed.success) {
    // Field names are sufficient to fix startup; never echo secret-bearing input.
    throw new ConfigurationError([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
  }
  return {
    environment: parsed.data.V3L0CITY_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    dbPath: parsed.data.V3L0CITY_SERVER_DB,
    publicWsUrl: parsed.data.V3L0CITY_PUBLIC_WS_URL?.replace(/\/$/, ''),
    shutdownTimeoutMs: parsed.data.SHUTDOWN_TIMEOUT_MS,
  };
};
