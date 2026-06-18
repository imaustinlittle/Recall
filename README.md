# Recall

Self-hosted meeting transcription platform. Record live audio or upload existing files and get an editable, searchable transcript with speaker labels, AI summaries, and timestamped notes — all running locally with no cloud dependencies.

---

## Features

- **Transcription** — local Whisper model (tiny → large-v3), no cloud API
- **Speaker diarization** — optional pyannote.audio labels each speaker
- **Transcript editor** — inline editing, split/merge segments, speaker renaming
- **AI summary** — auto-generated via local Ollama LLM after transcription; re-runnable after renaming speakers
- **Summary → Notes** — one-click import of action items and decisions from the summary into structured notes
- **Timestamped notes** — general, action item, decision, and question note types linked to audio timestamps; keyboard shortcut (D) while listening
- **Export** — TXT, Markdown, SRT, VTT, PDF
- **Full-text search** — search across meeting titles, transcripts, and notes
- **Speaker profiles** — see all unique speaker names across meetings and which recordings they appear in
- **Calendar sidebar** — browse meetings by date; dot indicators on days with recordings
- **Keyboard shortcuts** — A (back 10s), S (play/pause), D (add note), F (forward 10s), Q (rename speaker)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Tailwind CSS, TypeScript |
| Backend | Python FastAPI |
| Database | PostgreSQL 16 |
| Queue | Redis + Celery |
| Transcription | faster-whisper (local) |
| Diarization | pyannote.audio 3 (optional) |
| Summarization | Ollama (local LLM, default: llama3.1:8b) |
| Storage | Local filesystem / MinIO (S3-compatible) |
| Proxy | Traefik (production) |

---

## Quick start

### Option A — Pull from GitHub Container Registry (recommended)

```bash
curl -O https://raw.githubusercontent.com/imaustinlittle/recall/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/imaustinlittle/recall/main/.env.example
cp .env.example .env
```

Open `.env` and set at minimum:

```bash
POSTGRES_PASSWORD=pick_a_strong_password
SECRET_KEY=pick_a_long_random_string
```

Then pull and start:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Option B — Build from source

```bash
git clone https://github.com/imaustinlittle/recall.git
cd recall
cp .env.example .env
# edit .env as above
docker compose up --build
```

First run bakes the Whisper model into the image — takes 2–5 minutes.

### Open the app

| Service | URL |
|---|---|
| Recall | http://localhost:3000 |
| API docs | http://localhost:8000/api/docs |
| Flower (Celery monitor) | http://localhost:5555 (run with `--profile dev`) |

Register an account at http://localhost:3000/login, create a meeting, and either record directly in the browser or upload an existing audio/video file.

---

## Whisper model sizes

Set `WHISPER_MODEL` in `.env`:

| Model | VRAM | Speed | Accuracy |
|---|---|---|---|
| `tiny` | ~1 GB | Very fast | Low |
| `base` | ~1 GB | Fast | OK |
| `small` | ~2 GB | Medium | Good |
| `medium` | ~5 GB | Slow | Great |
| `large-v3` | ~10 GB | Very slow | Best |

Start with `base` and upgrade once you're happy with the setup. Model can also be changed at runtime via **Settings** in the UI without rebuilding.

---

## Speaker diarization (optional)

Diarization identifies who spoke when. **Disabled by default** — requires extra setup.

1. Accept the model license at https://huggingface.co/pyannote/speaker-diarization-3.1
2. Create a HuggingFace access token at https://huggingface.co/settings/tokens
3. Set in `.env`:
   ```bash
   USE_DIARIZATION=true
   HUGGINGFACE_TOKEN=hf_your_token_here
   ```
4. Rebuild: `docker compose up --build`

Or enable it from the **Settings** page in the UI without rebuilding.

---

## AI summarization (Ollama)

Summaries run locally via Ollama. On first deploy, pull the model:

```bash
docker exec recall_ollama ollama pull llama3.1:8b
```

This is a one-time ~5 GB download. Summaries generate automatically after transcription completes, or can be triggered manually from the meeting page. The model can be changed from the **Settings** page.

---

## Authentication

By default Recall uses its own email/password login (`AUTH_MODE=local`). If you
run a homelab SSO like **Authentik** in front of your services, you can hand auth
off to it instead so Recall has no separate login.

### Proxy mode (Authentik forward-auth)

Set in `.env`:

```bash
AUTH_MODE=proxy
PROXY_AUTH_ADMIN_GROUP=recall-admins   # optional; blank = every user is admin
```

Then put Recall behind an Authentik **Proxy Provider** + Traefik `forwardAuth`
middleware. Authentik injects identity headers (`X-Authentik-Email`,
`-Name`, `-Groups`) which Recall trusts:

- Users are **provisioned just-in-time** from the headers, keyed by email — all
  existing meetings/notes stay attached to the same account.
- A user in `PROXY_AUTH_ADMIN_GROUP` becomes an app admin (can open **Settings**).
  Leave it blank to treat every authenticated user as an admin.
- The UI hides its login form and **Sign out** points at Authentik
  (`PROXY_AUTH_LOGOUT_URL`, default `/outpost.goauthentik.io/sign_out`).

> ⚠️ **Security:** proxy mode trusts the identity headers, so the app must be
> reachable **only** through the authenticating proxy. In `docker-compose.prod.yml`
> the `api` is internal-only and just the `frontend` is exposed via Traefik — keep
> it that way. Make sure your Traefik `forwardAuth` middleware lists those headers
> in `authResponseHeaders` so a client cannot spoof them.

Header names are configurable (`PROXY_AUTH_*_HEADER`) if you use a different
provider that sets trusted headers.

---

## Useful commands

```bash
# View live logs
docker compose logs -f api
docker compose logs -f worker

# Run migrations after model changes
docker compose exec api alembic revision --autogenerate -m "describe_change"
docker compose exec api alembic upgrade head

# Open a database shell
docker compose exec postgres psql -U recall -d recall

# Start Celery monitor (Flower)
docker compose --profile dev up flower
# → http://localhost:5555

# Restart just the worker (after config changes)
docker compose restart worker

# Tear everything down (keeps volumes)
docker compose down

# Tear down and delete all data
docker compose down -v
```

---

## Project structure

```
recall/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── routers/         # FastAPI route handlers
│   │   ├── services/        # Audio, transcription, diarization, storage
│   │   └── workers/         # Celery app + tasks
│   └── alembic/             # Database migrations
└── frontend/
    └── src/
        ├── app/             # Next.js App Router pages
        ├── components/      # React components
        └── lib/             # API client, hooks, utilities
```

---

## Roadmap

| Status | Feature |
|---|---|
| ✅ | Upload or record → transcribe → editable transcript |
| ✅ | Speaker diarization (optional) |
| ✅ | Inline transcript editing, split/merge segments |
| ✅ | Timestamped notes (action items, decisions, questions) |
| ✅ | Export: TXT, Markdown, SRT, VTT, PDF |
| ✅ | AI meeting summary (local Ollama) |
| ✅ | Summary → Notes import |
| ✅ | Full-text search across transcripts and notes |
| ✅ | Speaker profiles across meetings |
| ✅ | Calendar sidebar with per-day filtering |
| ✅ | Keyboard shortcuts for audio navigation |
| 🔄 | Calendar / CalDAV sync |
| 🔄 | Q&A over transcript (RAG) |
| 🔄 | Multi-user / team workspaces |
