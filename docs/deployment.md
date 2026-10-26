# Production Deployment

## Recommended free-first topology

- Frontend: Cloudflare Workers deployment from `frontend/`.
- Backend: Oracle Cloud Always Free VM or another Docker-capable free-tier VM.
- Database: PostgreSQL/pgvector on the same VM initially.
- Registry: GitHub Container Registry (GHCR).
- DNS/TLS: Cloudflare DNS and proxy.

Cloudflare cannot host the Dockerized PostgreSQL, worker, and AI-engine stack directly. The backend VM is required. Free-tier availability, billing verification, storage, and resource limits can change, so confirm them in the provider account before production use.

## One-time backend VM setup

Create a Linux VM, install Docker Compose, open only SSH and HTTPS, then run:

```bash
sudo mkdir -p /opt/sprintsmith/infra/deploy
sudo chown -R "$USER":"$USER" /opt/sprintsmith
```

Copy `infra/deploy/.env.production.example` to `/opt/sprintsmith/.env` and replace every placeholder. Never commit that file.

The VM must be able to pull private GHCR images. Configure these GitHub `production` environment secrets:

- `BACKEND_HOST`: VM public hostname or IP
- `BACKEND_USER`: SSH deployment user
- `BACKEND_SSH_KEY`: private SSH key
- `GHCR_READ_USER`: GitHub package reader
- `GHCR_READ_TOKEN`: read-only GHCR token
- `CLOUDFLARE_API_TOKEN`: scoped Workers/DNS token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID

Add the non-secret `PUBLIC_API_URL` environment variable, for example `https://api.rajmathuria.me`.

## DNS

Keep `portfolio.rajmathuria.me` unchanged. Add separate records:

- `api.rajmathuria.me`: proxied record to the backend VM
- `app.rajmathuria.me`: Cloudflare Worker hostname, or use the generated `workers.dev` hostname first

Add the API hostname to `CORS_ORIGINS` in the VM `.env`. The frontend receives the same value as `VITE_API_URL` through `PUBLIC_API_URL`.

## Deployment pipeline

Pushes to `main` run `.github/workflows/deploy.yml` when backend, frontend, or deployment files change:

1. Build and publish backend-core and AI-engine images to GHCR.
2. SSH to the VM, pull immutable commit-tagged images, run migrations, and restart the backend stack.
3. Check `/health` on the deployed backend.
4. Build the TanStack frontend with `VITE_API_URL`.
5. Deploy the frontend Worker to Cloudflare.

The workflow is also available through **Actions > Production Deployment > Run workflow**. The first deployment should be approved through the GitHub `production` environment.

## Constraints

- No cloud credentials are stored in this repository.
- The AI-engine image is large and CPU-heavy because it includes Docling and document models.
- Free hosting is quota-based and may require payment verification.
- Configure backups, monitoring retention, and model API limits before real user data.
