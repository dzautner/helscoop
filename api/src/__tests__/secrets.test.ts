import { afterEach, describe, expect, it } from "vitest";
import {
  assertProductionSecrets,
  DEV_JWT_SECRET,
  getJwtSecret,
  getViewerIpHashSalt,
} from "../secrets";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  VIEW_IP_HASH_SALT: process.env.VIEW_IP_HASH_SALT,
};

function restoreEnv() {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  if (originalEnv.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalEnv.JWT_SECRET;
  if (originalEnv.VIEW_IP_HASH_SALT === undefined) delete process.env.VIEW_IP_HASH_SALT;
  else process.env.VIEW_IP_HASH_SALT = originalEnv.VIEW_IP_HASH_SALT;
}

afterEach(() => {
  restoreEnv();
});

describe("API secret configuration", () => {
  it("uses the development JWT fallback outside production", () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;

    expect(getJwtSecret()).toBe(DEV_JWT_SECRET);
  });

  it("trims and uses an explicit JWT_SECRET outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "  explicit-test-secret  ";

    expect(getJwtSecret()).toBe("explicit-test-secret");
  });

  it("fails production startup when JWT_SECRET is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;

    expect(() => assertProductionSecrets()).toThrow("JWT_SECRET must be set");
  });

  it("fails production startup when JWT_SECRET is empty", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "   ";

    expect(() => assertProductionSecrets()).toThrow("JWT_SECRET must be set");
  });

  it("fails production startup when JWT_SECRET is the public dev fallback", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = DEV_JWT_SECRET;

    expect(() => assertProductionSecrets()).toThrow("non-default");
  });

  it("allows production with a non-default JWT_SECRET", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "prod-secret-from-render-or-fly";
    delete process.env.VIEW_IP_HASH_SALT;

    expect(() => assertProductionSecrets()).not.toThrow();
    expect(getJwtSecret()).toBe("prod-secret-from-render-or-fly");
    expect(getViewerIpHashSalt()).toBe("prod-secret-from-render-or-fly");
  });

  it("uses VIEW_IP_HASH_SALT when explicitly configured", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "prod-secret-from-render-or-fly";
    process.env.VIEW_IP_HASH_SALT = "  viewer-salt  ";

    expect(getViewerIpHashSalt()).toBe("viewer-salt");
  });
});
