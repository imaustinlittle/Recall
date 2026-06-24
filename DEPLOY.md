# Deploy runbook

How Recall is built and deployed, plus rollback and backup/restore. Tailored to
the single-host homelab setup (Portainer on `sirius`, images from GHCR).

---

## How it flows

```
push to main ──> GitHub Actions builds backend + frontend images ──> GHCR (:main, :sha-…)
                                                                          │
                          Portainer Git-backed stack pulls compose + images ──> redeploy
```

- **Code** ships as images (CI builds them — the backend bakes the Whisper model,
  so you never want to build that on the host).
- **Config** (`docker-compose.prod.yml`) ships from the same git repo via a
  Portainer **Git-backed stack**, so compose changes deploy the same way code does.
- **Secrets** live in Portainer's stack env vars — never committed. `.env` is
  gitignored and only the *example* (`.env.example`) is in the repo.

---

## One-time setup: Portainer Git-backed stack

1. **Portainer → Stacks → Add stack → Repository.**
2. Repository URL: this repo. Compose path: `docker-compose.prod.yml`.
3. **Automatic updates:** enable, and use the **webhook** (preferred) or polling.
   - Webhook: copy the URL Portainer generates and call it from CI or `git` host
     after a push, or just hit it manually when you want to deploy.
4. **Environment variables:** paste the contents of your `.env` into the stack's
   env editor (or "Load variables from .env file"). This is where `SECRET_KEY`,
   `POSTGRES_PASSWORD`, `OLLAMA_BASE_URL`, `AUTH_MODE`, etc. live. **Do not commit
   these.**
5. Deploy.

> Prereq networks must already exist on the host: `traefik_proxy` and
> `ollama_default` (created by your Ollama stack). The stack attaches to them as
> external networks.

---

## Deploying a change

- **Code or compose change:** commit + push to `main`. CI builds images; the
  Portainer stack re-pulls compose + images and redeploys (auto if the webhook is
  wired, otherwise hit **Update the stack → Re-pull and redeploy**).
- **Only an env/secret change:** edit the stack's env vars in Portainer and
  redeploy. No push needed.
- Images track `:main`. To pin a specific build, set `IMAGE_TAG` (e.g.
  `IMAGE_TAG=sha-1a2b3c4` or a release like `1.3.0`) in the stack env.

### Migrations run automatically
The `api` container runs `alembic upgrade head` on every start. A normal deploy
applies new migrations — watch the `api` logs on first boot after a schema change.

---

## Rollback

Because config and code are both in git, rollback is a git operation:

```bash
git revert <bad-commit>      # or revert a range
git push
```

Portainer redeploys the previous state. If you pin `IMAGE_TAG`, also point it back
to the previous tag.

> ⚠️ A revert rolls back **code and schema expectations, not data** a migration
> already transformed. If a migration changed/destroyed data, restore from a
> backup (below) rather than relying on revert.

---

## Backups (the real safety net)

The `db-backup` service (`prodrigestivill/postgres-backup-local`) runs `pg_dump`
on a schedule with rotation, writing gzipped SQL to the `pg_backups` volume.

Defaults (override in stack env):

| Var | Default | Meaning |
|---|---|---|
| `BACKUP_SCHEDULE` | `@daily` | cron or `@daily`/`@hourly` |
| `BACKUP_KEEP_DAYS` | `7` | daily dumps kept |
| `BACKUP_KEEP_WEEKS` | `4` | weekly dumps kept |
| `BACKUP_KEEP_MONTHS` | `6` | monthly dumps kept |

**Keep backups off this host** by bind-mounting a NAS path instead of the named
volume — in the `db-backup` service change `- pg_backups:/backups` to
`- /mnt/nas/recall-backups:/backups`.

### Inspect backups
```bash
docker exec <db-backup-container> ls -lh /backups/daily
```

### Restore
Media files live in the `media_files` volume and are **not** in the DB dump — they
survive a DB restore as long as that volume is intact.

```bash
# 1. Stop the app so nothing writes during restore (keep postgres running)
docker compose -f docker-compose.prod.yml stop api worker-0 worker-1 beat frontend

# 2. Restore a chosen dump (gunzip → psql)
gunzip -c /path/to/pg_backups/daily/recall-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i <postgres-container> psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# 3. Start the app back up
docker compose -f docker-compose.prod.yml start api worker-0 worker-1 beat frontend
```

Test a restore at least once so you know it works *before* you need it.

---

## Post-deploy verification

1. App loads at `https://recall.austlie.com` and you can sign in.
2. **Settings → Diagnostics → Run tests** — Database, Redis, Worker, Ollama,
   HuggingFace (if used), Storage should all be green.
3. For schema changes, confirm the `api` logs show migrations applied with no error.
