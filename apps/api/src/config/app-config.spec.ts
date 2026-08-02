import { validateAppConfig } from './app-config';

const baseConfig = {
  DATABASE_URL: 'postgresql://postgres:postgres@example.com:5432/postgres',
  JWT_ACCESS_SECRET: 'access-secret-that-is-longer-than-thirty-two-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-that-is-longer-than-thirty-two-characters',
};

describe('validateAppConfig', () => {
  it('uses safe development defaults', () => {
    const config = validateAppConfig({ ...baseConfig, NODE_ENV: 'development' });
    expect(config.AUTH_COOKIE_SECURE).toBe(false);
    expect(config.AUTH_STRICT_SESSION_CHECK).toBe(true);
    expect(config.CORS_ORIGINS).toContain('http://localhost:5173');
    expect(config.SWAGGER_ENABLED).toBe(true);
  });

  it('falls back to the public web origin in production', () => {
    const config = validateAppConfig({ ...baseConfig, NODE_ENV: 'production' });
    expect(config.AUTH_COOKIE_SECURE).toBe(true);
    expect(config.CORS_ORIGINS).toEqual(['https://epawati.samavet.in']);
  });

  it('removes local origins in production', () => {
    const config = validateAppConfig({
      ...baseConfig,
      CORS_ORIGINS: 'http://localhost:5173',
      NODE_ENV: 'production',
    });
    expect(config.CORS_ORIGINS).toEqual(['https://epawati.samavet.in']);
  });

  it('disables production Swagger by default', () => {
    const config = validateAppConfig({
      ...baseConfig,
      CORS_ORIGINS: 'https://epawati.samavet.in',
      NODE_ENV: 'production',
    });
    expect(config.SWAGGER_ENABLED).toBe(false);
  });

  it('parses false-like environment strings as false', () => {
    const config = validateAppConfig({
      ...baseConfig,
      AUTHKEY_WHATSAPP_ENABLED: 'false',
      NODE_ENV: 'development',
      SWAGGER_ENABLED: '0',
    });
    expect(config.AUTHKEY_WHATSAPP_ENABLED).toBe(false);
    expect(config.SWAGGER_ENABLED).toBe(false);
  });
});
