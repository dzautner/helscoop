# Helscoop Operations Runbook

Production operations baseline for the Helscoop API and web frontend.

---

## 1. Database Backups

### Manual backup (pg_dump)

```bash
# Full database dump — replace values as needed
pg_dump \
  --format=custom \
  --compress=9 \
  --no-acl \
  --no-owner \
  "$DATABASE_URL" \
  -f "helscoop_$(date +%Y%m%d_%H%M%S).dump"
```

- `--format=custom` produces a compressed, parallel-restoreable file (~10% of raw SQL size).
- Store the dump in a separate storage bucket (e.g. Fly Volumes backup, S3, or Backblaze B2).
- Recommended schedule: **daily** full backup, retained for 30 days. Weekly backup retained for 1 year.

### Automated backup (cron example)

```bash
# /etc/cron.d/helscoop-backup
# Runs at 02:00 UTC every day
0 2 * * * postgres pg_dump --format=custom --compress=9 "$DATABASE_URL" \
  -f "/backups/helscoop_$(date +\%Y\%m\%d).dump" && \
  aws s3 cp "/backups/helscoop_$(date +\%Y\%m\%d).dump" \
    s3://helscoop-backups/daily/ --storage-class STANDARD_IA
```

On Fly.io, prefer [Fly Postgres daily snapshots](https://fly.io/docs/postgres/managing/backup-and-restore/) plus an external offsite copy.

---

## 2. Database Restore Procedure

**Before restoring: notify the team. Restore is destructive on the target database.**

### Step-by-step restore

```bash
# 1. Stop the API to prevent writes during restore
fly scale count 0 --app helscoop-api   # or stop the relevant service

# 2. Create a restore target (new DB recommended to avoid data loss)
createdb helscoop_restore

# 3. Restore from dump
pg_restore \
  --format=custom \
  --no-acl \
  --no-owner \
  --dbname="$DATABASE_URL" \
  helscoop_20240420_020000.dump

# 4. Verify row counts match pre-incident counts
psql "$DATABASE_URL" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# 5. Run DB migrations to ensure schema is current
cd /app && npm run db:migrate

# 6. Restart the API
fly scale count 2 --app helscoop-api

# 7. Smoke-test /api/health and a sample API endpoint
curl https://api.helscoop.fi/api/health
```

### Point-in-time recovery (Fly Postgres)

```bash
fly postgres backup list --app helscoop-db
fly postgres backup restore --app helscoop-db --backup-id <id>
```

---

## 3. Restore Drill Schedule

Run a restore drill **quarterly** (every 3 months):

1. Export a fresh backup from production.
2. Restore to a staging database.
3. Start a staging API instance pointed at the staging DB.
4. Run the E2E test suite against staging: `cd e2e && npm test`.
5. Confirm all tests pass and record the time taken.
6. Document the drill in the incident log (date, who ran it, result, restoration time).

---

## 4. Monitoring Checklist

### Health endpoint

- `/api/health` returns `{ status: "ok", db: "ok", redis: "ok"|"unconfigured", uptime, version }`
- Monitor with an uptime service (Better Uptime, UptimeRobot, or Fly's built-in checks).
- Alert if status is not `"ok"` for 2+ consecutive checks (60s interval).

### Metrics to watch

| Metric | Warning | Critical |
|--------|---------|----------|
| API p99 latency | > 500ms | > 2s |
| Error rate (5xx) | > 1% | > 5% |
| DB connection pool exhaustion | > 70% | > 90% |
| Disk usage | > 70% | > 85% |
| Memory | > 75% | > 90% |

### Sentry

- Set up Sentry alerts for: any new issue, issue regression, spike (> 10 events/hour).
- Weekly digest: review top-5 errors and address any recurring ones.
- Audit log filter: `audit: true` in log aggregator (e.g. Datadog, Logtail) to review destructive actions.

---

## 5. Incident Response Template

Use this template for any P0/P1 incident.

```
## Incident: <short description>

**Date/time:** YYYY-MM-DD HH:MM UTC
**Severity:** P0 / P1 / P2
**Reporter:** @name
**Status:** Investigating | Mitigating | Resolved

### Timeline
- HH:MM UTC — Alert fired / issue reported
- HH:MM UTC — On-call engineer paged
- HH:MM UTC — Root cause identified: <description>
- HH:MM UTC — Mitigation applied: <action taken>
- HH:MM UTC — Incident resolved

### Impact
- Users affected: <estimate>
- Data affected: yes / no (describe if yes)
- Duration: HH:MM

### Root cause
<1-2 sentences>

### Fix
<What was done to resolve it>

### Follow-up actions
- [ ] Action item 1 (owner: @name, due: date)
- [ ] Action item 2

### Lessons learned
<What to do differently next time>
```

---

## 6. Audit Log Reference

Audit events are emitted by the API with the field `"audit": true`. Filter in your log aggregator with:

```
audit = true
```

| Action | Trigger |
|--------|---------|
| `project.delete` | User soft-deletes a project |
| `project.permanent_delete` | User permanently deletes a trashed project |
| `account.delete` | User deletes their account |

Each event includes: `userId`, `action`, `timestamp`, `targetId` (where applicable), `ip`.
