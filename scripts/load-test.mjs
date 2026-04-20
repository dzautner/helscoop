#!/usr/bin/env node

/**
 * Helscoop API load / stress test script.
 *
 * Exercises key API endpoints under concurrent load and verifies the
 * rate limiter kicks in at expected thresholds.
 *
 * Usage:
 *   node scripts/load-test.mjs                       # defaults: localhost:3001
 *   node scripts/load-test.mjs --base http://host:port --concurrency 20
 *   node scripts/load-test.mjs --rate-limit-only      # only run rate-limit verification
 *
 * Requires: Node >= 18 (native fetch)
 * No external dependencies.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/551
 */

import { performance } from "node:perf_hooks";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function flag(name) {
  return args.includes(`--${name}`);
}
function opt(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const BASE = opt("base", "http://localhost:3001").replace(/\/$/, "");
const CONCURRENCY = Number(opt("concurrency", "20"));
const RATE_LIMIT_ONLY = flag("rate-limit-only");

// ---------------------------------------------------------------------------
// Colour helpers (works in most terminals)
// ---------------------------------------------------------------------------
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarise(latencies, statuses) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = latencies.length;
  const ok = statuses.filter((s) => s >= 200 && s < 400).length;
  const rateLimit = statuses.filter((s) => s === 429).length;
  const errors = total - ok - rateLimit;
  const elapsed = sorted.reduce((a, b) => a + b, 0);
  return {
    total,
    ok,
    rateLimit,
    errors,
    rps: total / (elapsed / 1000 / total || 1),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
  };
}

function printSummary(label, stats) {
  const statusLine = [
    green(`${stats.ok} ok`),
    stats.rateLimit > 0 ? yellow(`${stats.rateLimit} rate-limited`) : null,
    stats.errors > 0 ? red(`${stats.errors} errors`) : null,
  ]
    .filter(Boolean)
    .join(", ");

  console.log(`\n${bold(label)}`);
  console.log(`  Requests : ${stats.total}  (${statusLine})`);
  console.log(
    `  Latency  : p50=${stats.p50.toFixed(1)}ms  p95=${stats.p95.toFixed(1)}ms  p99=${stats.p99.toFixed(1)}ms  min=${stats.min.toFixed(1)}ms  max=${stats.max.toFixed(1)}ms`,
  );
  console.log(`  Throughput: ~${stats.rps.toFixed(1)} req/s`);
}

// ---------------------------------------------------------------------------
// Request runner
// ---------------------------------------------------------------------------
async function timedFetch(url, opts = {}) {
  const t0 = performance.now();
  let status = 0;
  try {
    const res = await fetch(url, {
      ...opts,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    // Consume body to free socket
    await res.text();
  } catch (err) {
    status = err.name === "TimeoutError" ? 408 : 0;
  }
  return { latency: performance.now() - t0, status };
}

async function runBatch(label, url, n, fetchOpts = {}) {
  const latencies = [];
  const statuses = [];

  // Fire n requests with up to CONCURRENCY in-flight
  const queue = Array.from({ length: n }, (_, i) => i);
  const inflight = new Set();

  async function next() {
    while (queue.length > 0) {
      const _i = queue.shift();
      const p = timedFetch(url, fetchOpts).then(({ latency, status }) => {
        latencies.push(latency);
        statuses.push(status);
        inflight.delete(p);
      });
      inflight.add(p);
      if (inflight.size >= CONCURRENCY) {
        await Promise.race(inflight);
      }
    }
    await Promise.all(inflight);
  }

  await next();

  const stats = summarise(latencies, statuses);
  printSummary(label, stats);
  return { latencies, statuses, stats };
}

// ---------------------------------------------------------------------------
// Rate-limit verification
// ---------------------------------------------------------------------------
async function verifyRateLimit(endpoint, expectedLimit, fetchOpts = {}) {
  const url = `${BASE}${endpoint}`;
  console.log(
    `\n${bold(`Rate-limit check: ${endpoint}`)} ${dim(`(limit=${expectedLimit})`)}`,
  );

  const statuses = [];
  // Send expectedLimit + 5 requests sequentially to avoid timing issues
  for (let i = 0; i < expectedLimit + 5; i++) {
    const { status } = await timedFetch(url, fetchOpts);
    statuses.push(status);
  }

  const rateLimited = statuses.filter((s) => s === 429);
  const firstRateLimitIdx = statuses.indexOf(429);

  if (rateLimited.length > 0) {
    console.log(
      green(
        `  PASS: Got 429 after ${firstRateLimitIdx} requests (${rateLimited.length} total 429s)`,
      ),
    );
    if (firstRateLimitIdx > expectedLimit) {
      console.log(
        yellow(
          `  WARN: First 429 at request #${firstRateLimitIdx + 1}, expected around #${expectedLimit + 1}`,
        ),
      );
    }
    return true;
  } else {
    console.log(
      red(
        `  FAIL: No 429 received after ${statuses.length} requests. ` +
          `This may be expected if NODE_ENV=test (limits set to 10000).`,
      ),
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(bold("\n=== Helscoop API Load Test ==="));
  console.log(`Target : ${BASE}`);
  console.log(`Concurrency : ${CONCURRENCY}`);
  console.log(`Date : ${new Date().toISOString()}\n`);

  // Quick connectivity check
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.log(
        yellow(`WARNING: /health returned ${res.status}. Server may not be fully ready.`),
      );
    } else {
      const body = await res.json();
      console.log(
        green(`Server is up — status=${body.status}, uptime=${body.uptime}s`),
      );
    }
  } catch (err) {
    console.error(red(`Cannot reach ${BASE}/health — is the API running?`));
    console.error(dim(`  Error: ${err.message}`));
    process.exit(1);
  }

  if (!RATE_LIMIT_ONLY) {
    // -----------------------------------------------------------------------
    // Throughput tests
    // -----------------------------------------------------------------------
    console.log(bold("\n--- Throughput Tests ---"));

    // 1. Health endpoint (no rate limit, lightweight)
    await runBatch("GET /health", `${BASE}/health`, 200);

    // 2. Templates endpoint (public, read-only)
    await runBatch("GET /templates", `${BASE}/templates`, 100);

    // 3. Categories endpoint (public, read-only)
    await runBatch("GET /categories", `${BASE}/categories`, 100);

    // 4. Auth login (will get 400 but tests throughput under rate limiter)
    await runBatch("POST /auth/login (invalid body)", `${BASE}/auth/login`, 50, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // 5. Materials endpoint (needs auth, will get 401)
    await runBatch("GET /materials (no auth)", `${BASE}/materials`, 100);

    // 6. Projects endpoint (needs auth, will get 401)
    await runBatch("GET /projects (no auth)", `${BASE}/projects`, 100);
  }

  // -----------------------------------------------------------------------
  // Rate-limit verification
  // -----------------------------------------------------------------------
  console.log(bold("\n--- Rate Limit Verification ---"));
  console.log(
    dim(
      "  Note: If the server is running with NODE_ENV=test, limits are 10000\n" +
        "  and these checks will report FAIL (expected behaviour).",
    ),
  );

  // Public endpoints: 100 req/15min in production
  await verifyRateLimit("/templates", 100);

  // Auth endpoints: 30 req/15min in production
  await verifyRateLimit("/auth/login", 30, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  console.log(bold("\n=== Load Test Complete ===\n"));
}

main().catch((err) => {
  console.error(red(`Fatal: ${err.message}`));
  process.exit(1);
});
