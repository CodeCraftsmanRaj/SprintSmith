# Production Deployment

## Backend deployment

- Frontend: Cloudflare Workers deployment from `frontend/`.
- Backend: a Docker-capable VM (for example, Google Compute Engine).
- Database: PostgreSQL/pgvector on the same VM initially.
- Registry: Google Artifact Registry for the GCP-native deployment path.
- DNS/TLS: Cloudflare DNS and proxy.

Cloudflare cannot host the Dockerized PostgreSQL, worker, and AI-engine stack directly. The backend VM is required. Free-tier availability, billing verification, storage, and resource limits can change, so confirm them in the provider account before production use.

## One-time backend VM setup

Create a Linux VM, install Docker Compose, open only SSH and HTTPS, then run:

```bash
sudo mkdir -p /opt/sprintsmith/infra/deploy
sudo chown -R "$USER":"$USER" /opt/sprintsmith
```

Copy `infra/deploy/.env.production.example` to `/opt/sprintsmith/.env` and replace every placeholder. Never commit that file.

The production GitHub Actions workflow can publish images to GHCR. For a
gcloud-driven GCP deployment, use the script and Cloud Build configuration
described below; this path publishes to the existing `devpilot-repo`
Artifact Registry repository and does not require a GitHub Actions SSH key.

The GHCR workflow requires these GitHub repository secrets (or `production`
environment secrets if that environment is configured for both publishing
and deployment):

- `BACKEND_HOST`: VM public hostname or IP
- `BACKEND_USER`: SSH deployment user
- `BACKEND_SSH_KEY`: private SSH key
- `GHCR_READ_USER`: GitHub package reader
- `GHCR_READ_TOKEN`: a read-only token with `read:packages`

The VM does **not** need a Git checkout. The workflow copies
`infra/deploy/compose.production.yaml` to the VM, authenticates to GHCR, and
starts the published container images. Therefore, `/opt/sprintsmith` not being
a Git repository is expected; it should contain `.env` and
`infra/deploy/compose.production.yaml`.

Set the repository Actions variable `BACKEND_DEPLOY_ENABLED` to `true` only after `BACKEND_HOST`,
`BACKEND_USER`, and `BACKEND_SSH_KEY` are configured and the VM is prepared.
The frontend job is skipped unless the repository Actions variable
`DEPLOY_FRONTEND` is exactly `true`.

## Verify a GCE deployment

Find the VM's current external IP in Google Cloud Console under **Compute
Engine > VM instances**, or run:

```bash
gcloud compute instances describe sprintsmith-backend \
  --zone=us-central1-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

Check deployment state and the backend from the VM:

```bash
gcloud compute ssh sprintsmith-backend --zone=us-central1-a \
  --command='cd /opt/sprintsmith && docker compose --env-file .env -f infra/deploy/compose.production.yaml ps'

gcloud compute ssh sprintsmith-backend --zone=us-central1-a \
  --command='curl --fail http://localhost:8002/health'
```

The production Compose stack binds the backend gateway to loopback on port
`8002` for VM-local health checks. Caddy serves HTTPS at
`https://sprintsmith-api.rajmathuria.me`; the AI engine and database remain
private to the Compose network. The separate platform API on port `8000` is
not part of this production stack. GCP ingress should allow only ports `80`
and `443` for the VM's `sprintsmith-backend` network tag (plus the separately
managed SSH rule).

## GCP-native build and deploy

The VM does not need a Git checkout. From a clean local checkout, with the
Google Cloud CLI authenticated to the target project and the required
application settings already configured in `/opt/sprintsmith/.env`, deploy
the current commit with:

```bash
gcloud config set project major-project-512815
bash infra/deploy/deploy-gcp.sh
```

The script submits the backend and AI-engine Docker builds to Cloud Build,
pushes commit-tagged images to Artifact Registry, copies the Compose, Caddy,
and database initialization files to the VM, updates only the image tags in
the VM `.env`, then restarts the stack and checks health. It uses
`sprintsmith-api.rajmathuria.me` as the API host. The VM service account must have
Artifact Registry Reader access and an access scope that allows Artifact
Registry authentication.

If a build succeeds but the VM rollout needs to be retried, reuse the published
tag without rebuilding:

```bash
SKIP_BUILD=true GCP_IMAGE_TAG=<published-image-tag> bash infra/deploy/deploy-gcp.sh
```

The VM's reserved external IP is `34.9.97.6`. Keep any existing
`api.rajmathuria.me` DNS record unchanged. In Cloudflare DNS, create a separate
`sprintsmith-api` A record pointing to `34.9.97.6`; remove any stale manually
configured AAAA record for `sprintsmith-api`. Initially set the record to
**DNS only** so Caddy can obtain its origin HTTPS certificate. After
`https://sprintsmith-api.rajmathuria.me/health` works, optionally enable the
Cloudflare proxy and set SSL/TLS encryption to **Full (strict)**. Caddy
automatically retries certificate issuance; ports 80/443 must be open.
The deployment command checks the public API hostname and reports the DNS/TLS
prerequisite if local health succeeds but the public route does not.

## DNS

Keep existing `api.rajmathuria.me` and `portfolio.rajmathuria.me` unchanged.
Add separate SprintSmith hostnames:

- `sprintsmith-api.rajmathuria.me`: A record to the backend VM (`34.9.97.6`)
- `app.rajmathuria.me`: Cloudflare Worker custom domain

Set `CORS_ORIGINS=https://app.rajmathuria.me` in the VM `.env`. Build the
frontend with `VITE_API_URL=https://sprintsmith-api.rajmathuria.me`; for the
GitHub Actions frontend workflow, set the repository variable
`PUBLIC_API_URL` to that same API URL.

## Deploy the frontend manually

From `frontend/`, build with the public API URL and deploy the Worker:

```bash
npm ci
VITE_API_URL=https://sprintsmith-api.rajmathuria.me npm run build
npx wrangler login
npx wrangler deploy
```

In the Cloudflare dashboard, open **Workers & Pages > sprintsmith-frontend >
Settings > Domains & Routes > Add > Custom Domain**, then add
`app.rajmathuria.me`. Leave the existing `api.rajmathuria.me` record untouched.
Verify the API at `https://sprintsmith-api.rajmathuria.me/health` and the
frontend at `https://app.rajmathuria.me`.

## Deployment pipeline

Every push to `main` runs `.github/workflows/deploy.yml`. The GHCR backend
image publishing and VM deployment happen when the repository Actions
variable `BACKEND_DEPLOY_ENABLED` is exactly `true`; the frontend job is
skipped unless `DEPLOY_FRONTEND` is exactly `true`. The GCP-native deployment
is run explicitly with `bash infra/deploy/deploy-gcp.sh`.

1. Build and publish backend-core and AI-engine images to GHCR.
2. SSH to the VM, pull immutable commit-tagged images, run migrations, and restart the backend stack.
3. Check `/health` on the deployed backend.
4. The frontend deploy job is skipped unless `DEPLOY_FRONTEND` is set to `true`.

The workflow is also available through **Actions > Production Deployment > Run workflow**. The first deployment should be approved through the GitHub `production` environment.

## Constraints

- No cloud credentials are stored in this repository.
- The AI-engine image is large and CPU-heavy because it includes Docling and document models.
- Free hosting is quota-based and may require payment verification.
- Configure backups, monitoring retention, and model API limits before real user data.
