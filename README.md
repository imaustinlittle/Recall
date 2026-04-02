# Meetscribe

Self-hosted meeting transcription platform. Upload a recording, get a searchable, editable transcript with speaker labels — all running locally.

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
| Storage | Local filesystem / MinIO |
| Proxy | nginx |

---

## Quick start

### 1. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / Mac) or Docker + Docker Compose (Linux)
- 4 GB RAM minimum (8 GB recommended for `whisper-small` or larger)

### 2. Clone and configure

```bash
git clone <your-repo>
cd meetscribe
cp .env.example .env
```

Open `.env` and set at minimum:

```bash
POSTGRES_PASSWORD=pick_a_strong_password
SECRET_KEY=pick_a_long_random_string
```

### 3. Build and start

```bash
docker compose up --build
```

First run downloads the Whisper model — takes 2–5 minutes depending on your connection.

### 4. Run database migrations

In a second terminal:

```bash
docker compose exec api alembic revision --autogenerate -m "initial_schema"
docker compose exec api alembic upgrade head
```

### 5. Open the app

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| API docs | http://localhost:8000/api/docs |
| Celery monitor | http://localhost:5555 (run with `--profile dev`) |

Register an account at http://localhost:3000/login, create a meeting, and upload a recording.

---

## Whisper model sizes

Set `WHISPER_MODEL` in `.env`:

| Model | RAM | Speed (CPU) | Accuracy |
|---|---|---|---|
| `tiny` | ~1 GB | Very fast | Low |
| `base` | ~1 GB | Fast | OK |
| `small` | ~2 GB | Medium | Good |
| `medium` | ~5 GB | Slow | Great |
| `large-v3` | ~10 GB | Very slow | Best |

Start with `base` and upgrade once you're happy with the setup.

---

## Speaker diarization (optional)

Diarization identifies who spoke when. It is **disabled by default** because it requires extra setup.

To enable:

1. Accept the model license at https://huggingface.co/pyannote/speaker-diarization-3.1
2. Create a HuggingFace access token at https://huggingface.co/settings/tokens
3. Uncomment `pyannote.audio` and `torch` in `backend/requirements.txt`
4. Set in `.env`:
   ```bash
   USE_DIARIZATION=true
   HUGGINGFACE_TOKEN=hf_your_token_here
   ```
5. Rebuild: `docker compose up --build`

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
docker compose exec postgres psql -U meetscribe -d meetscribe

# Start Celery monitor (Flower)
docker compose --profile dev up flower
# → http://localhost:5555

# Restart just the worker (after code changes)
docker compose restart worker

# Tear everything down (keeps volumes)
docker compose down

# Tear down and delete all data
docker compose down -v
```

---

## Project structure

```
meetscribe/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── routers/         # FastAPI route handlers
│   │   ├── services/        # Audio, transcription, diarization, storage
│   │   └── workers/         # Celery app + tasks
│   └── alembic/             # Database migrations
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router pages
│       ├── components/      # React components
│       └── lib/             # API client, hooks, utilities
└── nginx/
    └── nginx.conf
```

---

## Phase roadmap

| Phase | Features |
|---|---|
| ✅ 1 — Core | Upload → transcribe → read transcript |
| 2 — Editor | Inline editing, split/merge segments, timestamped notes |
| 3 — Search & Calendar | Full-text search, Google Calendar / CalDAV sync |
| 4 — AI | Summaries, action item extraction, Q&A over transcripts |
