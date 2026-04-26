#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const e2eDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(e2eDir, "..");
const defaultDatabaseUrl = "postgres://helscoop:helscoop_dev@localhost:5433/helscoop";
const databaseUrl = process.env.E2E_DATABASE_URL || defaultDatabaseUrl;
const shouldStartDockerDb =
  !process.env.E2E_DATABASE_URL &&
  process.env.E2E_SKIP_DOCKER !== "1" &&
  process.env.E2E_USE_DOCKER_DB !== "0";
const apiPort = process.env.E2E_API_PORT || "3051";
const webPort = process.env.E2E_WEB_PORT || "3052";
const apiUrl = process.env.TEST_API_URL || `http://localhost:${apiPort}`;
const webUrl = process.env.TEST_WEB_URL || `http://localhost:${webPort}`;

const passthroughArgs = process.argv.slice(2);

function requirePath(relativePath, installHint) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    console.error(`Missing ${relativePath}. ${installHint}`);
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const {
    cwd = repoRoot,
    env = process.env,
    quiet = false,
    timeoutMs = 120_000,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: quiet ? "ignore" : "inherit",
    });

    const timer = timeoutMs
      ? setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : null;

    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

async function waitForDb() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await run("docker", ["compose", "exec", "-T", "db", "pg_isready", "-U", "helscoop", "-d", "helscoop"], {
        quiet: true,
        timeoutMs: 5_000,
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  throw new Error("Postgres did not become ready via docker compose service 'db'.");
}

async function main() {
  requirePath("api/node_modules/.bin/tsx", "Run `cd api && npm ci`.");
  requirePath("web/node_modules/.bin/next", "Run `cd web && npm ci`.");
  requirePath("e2e/node_modules/.bin/playwright", "Run `cd e2e && npm ci`.");

  if (shouldStartDockerDb) {
    console.log("Starting docker compose Postgres service...");
    await run("docker", ["compose", "up", "-d", "db"]);

    console.log("Waiting for Postgres readiness...");
    await waitForDb();
  } else {
    console.log(`Using existing Postgres database: ${databaseUrl}`);
  }

  console.log("Applying API migrations...");
  await run("npm", ["--prefix", "api", "run", "db:migrate"], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });

  console.log("Running Playwright E2E...");
  await run("npx", ["playwright", "test", ...passthroughArgs], {
    cwd: e2eDir,
    env: {
      ...process.env,
      E2E_DATABASE_URL: databaseUrl,
      TEST_API_URL: apiUrl,
      TEST_WEB_URL: webUrl,
    },
    timeoutMs: 0,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
