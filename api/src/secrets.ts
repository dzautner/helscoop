export const DEV_JWT_SECRET = "helscoop-dev-secret";

function envName(): string {
  return process.env.NODE_ENV || "development";
}

function normalizedEnv(name: string): string {
  return (process.env[name] || "").trim();
}

function isProduction(): boolean {
  return envName() === "production";
}

export function getJwtSecret(): string {
  const secret = normalizedEnv("JWT_SECRET");
  if (isProduction()) {
    if (!secret || secret === DEV_JWT_SECRET) {
      throw new Error("JWT_SECRET must be set to a non-default value in production");
    }
    return secret;
  }
  return secret || DEV_JWT_SECRET;
}

export function getViewerIpHashSalt(): string {
  const salt = normalizedEnv("VIEW_IP_HASH_SALT");
  if (salt) return salt;
  return getJwtSecret();
}

export function assertProductionSecrets(): void {
  getJwtSecret();
  getViewerIpHashSalt();
}
