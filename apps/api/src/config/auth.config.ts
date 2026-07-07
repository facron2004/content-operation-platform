const DEFAULT_JWT_SECRET = 'content-ops-default-secret-change-in-production';
const DEFAULT_ADMIN_PASSWORD = 'contentops2024';

function assertNotDefault(
  envValue: string | undefined,
  defaultValue: string,
  varName: string
): string {
  const value = envValue || defaultValue;
  if (process.env.NODE_ENV === 'production' && value === defaultValue) {
    throw new Error(
      `Security: ${varName} must be set to a custom value in production. ` +
        `The default value "${defaultValue}" is publicly known and cannot be used.`
    );
  }
  return value;
}

export const JWT_SECRET = assertNotDefault(
  process.env.JWT_SECRET,
  DEFAULT_JWT_SECRET,
  'JWT_SECRET'
);
export const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ??
  '2h') as `${number}${'s' | 'm' | 'h' | 'd'}`;
export const ADMIN_USERNAME = process.env.AUTH_USERNAME || 'admin';
export const ADMIN_PASSWORD = assertNotDefault(
  process.env.AUTH_PASSWORD,
  DEFAULT_ADMIN_PASSWORD,
  'AUTH_PASSWORD'
);
