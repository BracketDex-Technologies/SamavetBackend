import { z } from 'zod';

const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:5173',
  'https://epawati.samavet.in',
  'https://samavet-frontend.vercel.app',
];

const envBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_GLOBAL_PREFIX: z.string().min(1).default('api'),
  BODY_LIMIT: z.string().default('12mb'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  HEALTH_DB_TIMEOUT_MS: z.coerce.number().int().min(250).max(10_000).default(3_000),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1_000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).default(120),
  SWAGGER_ENABLED: envBoolean.optional(),
  PUBLIC_API_BASE_URL: z.string().default(''),
  PUBLIC_WEB_BASE_URL: z.string().url().default('https://epawati.samavet.in'),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(1).default('digital-mandal'),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_PUBLIC_BASE_URL: z.string().optional().default(''),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('digital-vargani'),
  AUTHKEY_API_KEY: z.string().optional().default(''),
  AUTHKEY_WHATSAPP_WID: z.string().optional().default(''),
  AUTHKEY_WHATSAPP_RECEIPT_WID: z.string().optional().default(''),
  AUTHKEY_WHATSAPP_COUNTRY_CODE: z.string().default('91'),
  AUTHKEY_WHATSAPP_TEMPLATE_TYPE: z.enum(['text', 'media']).default('media'),
  AUTHKEY_WHATSAPP_HEADER_MEDIA_URL: z.string().optional().default(''),
  AUTHKEY_WHATSAPP_HEADER_FILE_NAME: z.string().default('Vargani Receipt'),
  AUTHKEY_WHATSAPP_ENABLED: envBoolean.default(false),
  CORS_ORIGINS: z.string().optional(),
});

type ParsedAppConfig = z.infer<typeof appConfigSchema>;
export type AppConfig = Omit<ParsedAppConfig, 'CORS_ORIGINS' | 'SWAGGER_ENABLED'> & {
  CORS_ORIGINS: string[];
  SWAGGER_ENABLED: boolean;
};

export function validateAppConfig(config: Record<string, unknown>): AppConfig {
  const parsed = appConfigSchema.safeParse(config);

  if (!parsed.success) {
    const message = parsed.error.errors
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  const configuredOrigins = parsed.data.CORS_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const corsOrigins = Array.from(new Set(configuredOrigins?.length ? configuredOrigins : defaultCorsOrigins));

  if (parsed.data.NODE_ENV === 'production') {
    if (!configuredOrigins?.length) {
      throw new Error('Invalid environment configuration: CORS_ORIGINS is required in production.');
    }
    const unsafeOrigin = corsOrigins.find((origin) => /localhost|127\.0\.0\.1/.test(origin));
    if (unsafeOrigin) {
      throw new Error(`Invalid environment configuration: production CORS origin is local (${unsafeOrigin}).`);
    }
    if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
      throw new Error('Invalid environment configuration: access and refresh JWT secrets must be different.');
    }
  }

  return {
    ...parsed.data,
    CORS_ORIGINS: corsOrigins,
    SWAGGER_ENABLED: parsed.data.SWAGGER_ENABLED ?? parsed.data.NODE_ENV !== 'production',
  };
}
