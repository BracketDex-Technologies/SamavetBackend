import { z } from 'zod';

const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:5173',
  'https://epawati.samavet.in',
  'https://samavet-frontend.vercel.app',
];

const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_GLOBAL_PREFIX: z.string().min(1).default('api'),
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
  AUTHKEY_WHATSAPP_ENABLED: z.coerce.boolean().default(false),
  CORS_ORIGINS: z
    .string()
    .default(defaultCorsOrigins.join(','))
    .transform((value) =>
      Array.from(
        new Set([
          ...value
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
          ...defaultCorsOrigins,
        ]),
      ),
    ),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function validateAppConfig(config: Record<string, unknown>): AppConfig {
  const parsed = appConfigSchema.safeParse(config);

  if (!parsed.success) {
    const message = parsed.error.errors
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  return parsed.data;
}
