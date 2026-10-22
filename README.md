# SprintSmith

Provider-neutral enterprise search and RAG platform. The current foundation is
Dockerized, observable, and ready for the ingestion and hybrid retrieval slices.
The first product surface is enterprise search, with contracts that can later
provide context to an agent runtime.

## Quick start

Requirements: Docker Engine with Compose, Python 3.13+, and `uv` for local
quality checks.

```bash
uv sync --extra dev
docker compose up -d --build
docker compose ps
```

Check the running API:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
curl http://localhost:8000/metrics
curl -X POST http://localhost:8000/v1/search \
	-H 'content-type: application/json' \
	-d '{"query":"retention policy","top_k":10}'
```

Stop the local stack without deleting persisted volumes:

```bash
docker compose down
```

To remove local PostgreSQL, Prometheus, and Grafana data as well:

```bash
docker compose down -v
```

## Repository shape

- `apps/api`: HTTP boundary and API contracts
- `apps/worker`: asynchronous ingestion boundary
- `packages`: future domain, retrieval, provider, and observability libraries
- `infra/docker`: service images
- `tests`: executable contracts and integration tests
- `.github/workflows`: CI checks

The backend is intentionally split into two deployable boundaries inside this
monorepo: `apps/api` owns HTTP contracts and `apps/worker` will own asynchronous
ingestion. Shared domain, retrieval, provider, and observability packages will
be added under `packages/` as their contracts stabilize. A frontend is reserved
for later work and is not included yet.

## What is implemented

- FastAPI service with health, readiness, metrics, and initial search endpoints
- Request IDs and structured JSON request/service logs
- Prometheus request counters and latency histograms
- Separate worker container boundary
- PostgreSQL 17 with `pgvector` image, exposed locally on port `5433`
- Prometheus scraping the API on the internal Compose network
- Grafana datasource and `SprintSmith API` dashboard provisioning
- Non-root API and worker Docker images
- GitHub Actions workflow for dependency installation, Ruff, pytest, and Compose validation
- Reproducible Python dependency lockfile through `uv.lock`

The supplied DOCX and ZIP are reference material only. They are not imported
as runtime dependencies. Do not commit extracted contents, secrets, raw
document text, or unrestricted prompts.

## Local URLs

Open these addresses in a browser while the stack is running:

| Component | URL | Purpose |
| --- | --- | --- |
| API health | [localhost:8000/health](http://localhost:8000/health) | Liveness response |
| API readiness | [localhost:8000/ready](http://localhost:8000/ready) | Readiness response |
| API metrics | [localhost:8000/metrics](http://localhost:8000/metrics) | Prometheus exposition format |
| API documentation | [localhost:8000/docs](http://localhost:8000/docs) | Interactive OpenAPI UI |
| Prometheus | [localhost:9090](http://localhost:9090) | Queries, targets, and time series |
| Prometheus targets | [localhost:9090/targets](http://localhost:9090/targets) | Confirm scrape status is `UP` |
| Grafana | [localhost:3000](http://localhost:3000) | Local dashboards, anonymous viewer access |
| Grafana dashboard | [SprintSmith API dashboard](http://localhost:3000/d/sprintsmith-api/sprintsmith-api) | Request rate, p95 latency, response status |

Grafana is configured for local viewing only. It has anonymous viewer access
and must not be exposed publicly without authentication and network controls.

## Logs and operational checks

Follow all application and observability logs in one terminal:

```bash
docker compose logs -f --tail=100 api worker db prometheus grafana
```

Follow only the API and worker logs:

```bash
docker compose logs -f --tail=100 api worker
```

Check container health and Prometheus targets:

```bash
docker compose ps
curl http://localhost:9090/api/v1/targets
curl http://localhost:3000/api/health
```

The expected Prometheus target jobs are `prometheus` and `sprintsmith-api`,
both with health `up`.

## Local checks

```bash
uv sync --extra dev
uv run ruff check .
uv run pytest -q
docker compose config
git diff --check
```

The GitHub Actions workflow runs the same core checks on pushes to `main` and
on pull requests. View results at the repository's GitHub Actions page:
[github.com/CodeCraftsmanRaj/SprintSmith/actions](https://github.com/CodeCraftsmanRaj/SprintSmith/actions).

## Local services

Docker must be running for the full stack:

```bash
docker compose up --build
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

## Current limitations and next slice

`POST /v1/search` currently validates the hybrid-search contract and returns an
empty result list. The following production features are intentionally next:

1. Database migrations and typed document/chunk/ingestion-job models.
2. DOCX and other document ingestion with idempotent asynchronous jobs.
3. PostgreSQL full-text retrieval plus `pgvector` semantic retrieval.
4. Reciprocal-rank fusion, citations, retrieval evaluation, and regression gates.
5. Authentication, tenant isolation, rate limits, retention, backups, and alerts.
6. Cloud deployment through GitHub OIDC after the free-tier runtime is selected.

No cloud credentials or DNS changes are required for the current local stack.
The existing `portfolio.rajmathuria.me` host is not changed by this project.

## Reference artifacts

The supplied DOCX and ZIP are authorized reference material for local
inspection, but are ignored by Git and are not imported as runtime dependencies.
Do not commit extracted contents, secrets, raw document text, or unrestricted
prompts. The current platform does not transmit their contents to an external
model provider.
