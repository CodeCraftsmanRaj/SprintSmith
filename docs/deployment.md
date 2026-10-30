# Production Deployment

## Backend deployment

- Frontend: Cloudflare Workers deployment from `frontend/`.
- Backend: Google Compute Engine VM `sprintsmith-backend` in `us-central1-a`.
- Database: PostgreSQL/pgvector in the private Docker Compose network on the VM.
- Registry: Google Artifact Registry repository `sprintsmith-repo` in `us-central1`.
- DNS/TLS: Cloudflare DNS and proxy.

Cloudflare cannot host the Dockerized PostgreSQL, worker, and AI-engine stack directly. The backend VM is required. Free-tier availability, billing verification, storage, and resource limits can change, so confirm them in the provider account before production use.

## Current deployed state

- GCP project: `major-project-512815`
- VM: `sprintsmith-backend`, zone `us-central1-a`
- Reserved external IP: `34.9.97.6`
- API: `https://sprintsmith-api.rajmathuria.me`
- Frontend hostname: `app.rajmathuria.me`
- Grafana: served on the API hostname at `/grafana/` (no DNS record needed);
  optional dedicated hostname `grafana.rajmathuria.me`.
- Existing `api.rajmathuria.me` and `portfolio.rajmathuria.me` are separate
  hostnames and must not be changed for this deployment.
- The Compose services are `backend-core`, `ai-engine`, `db`, `caddy`,
  `prometheus`, and `grafana`. The backend binds to loopback port `8002`; only
  Caddy's ports 80/443 are public. The AI engine, database, Prometheus, and
  Grafana are private to the Compose network.

The backend and AI engine have been deployed. The API's `/health`, `/health/db`,
`/health/ai`, and `/docs` have returned HTTP 200 on the VM, and the public API
health endpoint has been verified over HTTPS. Provider keys are stored in the
VM's `/opt/sprintsmith/.env`; never print or commit that file.

## One-time GCP IAM bootstrap

The GitHub deploy service account must be allowed to submit Cloud Build jobs,
write the source archive to the Cloud Build staging bucket, push images to
Artifact Registry, and let the VM pull those images. A project owner runs this
once from a checkout:

```bash
GOOGLE_CLOUD_PROJECT=major-project-512815 bash infra/deploy/gcp-bootstrap.sh
```

This is a one-time project-owner action; GitHub Actions cannot grant its own
missing GCP permissions. Run it before retrying a failed deployment. If the
script has already completed successfully and the same error persists, verify
the deploy service account's project roles and staging-bucket IAM bindings in
Cloud Console, and check whether an organization policy prevents those grants.

The script is idempotent. It enables the required APIs, creates
`sprintsmith-repo`, creates `gs://major-project-512815_cloudbuild` if needed,
and grants the deploy, Cloud Build, and VM service accounts the required
roles. It does not touch application secrets.

If the production workflow fails with:

```text
The user is forbidden from accessing the bucket [major-project-512815_cloudbuild]
```

re-run the bootstrap script. The missing permission is almost always
`roles/serviceusage.serviceUsageConsumer`, `roles/cloudbuild.builds.editor`,
or object access on the staging bucket.

## One-time backend VM setup

```bash
gcloud compute instances describe sprintsmith-backend \
  --project major-project-512815 \
  --zone us-central1-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

The VM already has Docker Compose and `/opt/sprintsmith/.env`. The VM does
**not** need a Git checkout. GitHub Actions uses Workload Identity Federation
to authenticate to GCP without a service-account key, runs Cloud Build, and
updates the containers over OS Login. No `BACKEND_HOST`, SSH private key, or
GHCR pull token is needed.

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
  --command='cd /opt/sprintsmith && sudo docker compose --env-file .env -f infra/deploy/compose.production.yaml ps'

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

## GCP-native manual build and deploy

From a local checkout, with `gcloud` authenticated to the target project,
deploy the current commit with:

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
- `grafana.rajmathuria.me`: optional A record to the backend VM (`34.9.97.6`)
  for a dedicated Grafana hostname; without it, use
  `https://sprintsmith-api.rajmathuria.me/grafana/`
- `app.rajmathuria.me`: Cloudflare Worker custom domain

Set `CORS_ORIGINS=https://app.rajmathuria.me` in the VM `.env`. The GitHub
Actions frontend workflow builds with
`VITE_API_URL=https://sprintsmith-api.rajmathuria.me`.

## Deploy the frontend manually

The repo's `frontend/wrangler.jsonc` config attaches
`app.rajmathuria.me` as a Worker custom domain. From `frontend/`, confirm
Wrangler is logged into the Cloudflare account that owns the active
`rajmathuria.me` zone, then build and deploy:

```bash
npx wrangler whoami
npm ci
VITE_API_URL=https://sprintsmith-api.rajmathuria.me npm run build
npx wrangler login # only if whoami shows the wrong account or no login
npx wrangler deploy
```

Cloudflare creates/updates the Worker's custom-domain DNS and certificate.
Do not add a manual A record for `app`, and leave the existing
`api.rajmathuria.me` record untouched. Verify the API at
`https://sprintsmith-api.rajmathuria.me/health` and the frontend at
`https://app.rajmathuria.me`.

## Monitoring

The production Compose stack runs Prometheus and Grafana next to the backend:

- Backend: `/metrics` on the private backend port (Prometheus exposition).
- Prometheus: internal `prometheus:9090`, scraping `backend-core:8000/metrics`.
- Grafana: `https://sprintsmith-api.rajmathuria.me/grafana/`, dashboard
  `SprintSmith API`. This subpath route reuses the existing API hostname, so
  **no DNS record is required**.

Optionally, for a dedicated hostname, add an `A` record `grafana` -> the VM
static IP (`34.9.97.6`, DNS only at first), then set in `/opt/sprintsmith/.env`:

```bash
GRAFANA_ROOT_URL=https://grafana.rajmathuria.me/
GRAFANA_SERVE_FROM_SUB_PATH=false
```

and re-run the deployment. Existing `api.rajmathuria.me` and
`portfolio.rajmathuria.me` stay untouched either way.

The Grafana admin credentials come from the VM `.env`:

- `GRAFANA_ADMIN_USER` (default `admin`)
- `GRAFANA_ADMIN_PASSWORD`

If the password is missing, `infra/deploy/prepare-vm-env.py` generates a random
one and stores it in `/opt/sprintsmith/.env`. Read it from the VM:

```bash
gcloud compute ssh sprintsmith-backend --zone=us-central1-a \
  --command='sudo grep -E "^GRAFANA_ADMIN_(USER|PASSWORD)=" /opt/sprintsmith/.env'
```

Anonymous access is disabled in production. Keep Prometheus private; query it
through Grafana instead of exposing port 9090 publicly.

## GitHub Actions pipelines

Four test workflows run on pull requests, feature-branch pushes, and manual
dispatches. The production workflow starts on `main` pushes and manual
dispatches:

1. `CI`: root lint and unit tests.
2. `Full Stack Platform`: both Compose profiles, stack startup, and smoke test.
3. `SprintSmith Backend Core`: backend unit, repository, migration, and PostgreSQL integration tests.
4. `SprintSmith AI Engine`: offline AI-engine tests.
5. `Production Deployment`: triggered on pushes to `main` and by manual
   dispatch; the two deployment jobs run only for `main`.

The CI and full-stack workflows intentionally have separate responsibilities:
CI runs the root lint and unit tests; Full Stack validates Compose, starts the
stack, and smoke-tests the API. Backend-core and AI-engine tests are separate
pipelines. These four test workflows are reusable by the production workflow.
Pushes to `main` run those suites as production gates rather than starting
duplicate standalone runs; deployment starts only after all four succeed.
Pull requests, feature-branch pushes, and manual workflow dispatches retain
their standalone test runs.

The production workflow deploys backend and AI-engine images through Cloud
Build and Artifact Registry using the repository-restricted GCP Workload
Identity Federation provider. It does not use GHCR or long-lived GCP keys.
Backend deployment runs automatically after a push to `main`, but only after
the CI, full-stack, backend-core, and AI-engine test suites all pass. If a
test suite fails, neither deployment runs. The Cloudflare Worker job still runs
when the backend deployment itself fails (unless the workflow is cancelled),
provided all test suites passed. It runs only when the repository Actions
variable `DEPLOY_FRONTEND` is exactly `true`.

### Configure GitHub for frontend deployment

The GCP Workload Identity pool/provider and deployment service account are
already configured for `CodeCraftsmanRaj/SprintSmith` on `main`; the workflow
uses the provider and account directly. No GCP JSON key or additional GitHub
GCP secret is required. The deploy service account has build permissions and
bucket-scoped `roles/storage.legacyBucketWriter` and
`roles/storage.objectViewer` access to the Cloud Build staging bucket
`gs://major-project-512815_cloudbuild`. The writer role permits source upload;
the viewer role permits reading staged source objects.

In the repository's **Settings > Secrets and variables > Actions**, add the
following secrets (repository-level or `production` environment-level):

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with **Account > Workers
  Scripts > Edit** (and **Account > Account Settings > Read**). The token must
  be allowed to edit the `sprintsmith-frontend` Worker; a token scoped to a
  different Worker or account will fail with `No access to the specified
  service`. Create it at **Cloudflare Dashboard > My Profile > API Tokens >
  Create Token > Edit Cloudflare Workers**.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account identifier.

Then add the repository Actions variable:

- Name: `DEPLOY_FRONTEND`
- Value: `true`

The `CLOUDFLARE_ACCOUNT_ID` secret and `DEPLOY_FRONTEND=true` variable are
already configured for this repository. Only the API token still needs to be
added.

The frontend job builds with `VITE_API_URL=https://sprintsmith-api.rajmathuria.me`
and deploys the Worker named `sprintsmith-frontend`. The Wrangler config
attaches `app.rajmathuria.me` as a custom domain and Cloudflare creates the DNS
record and certificate. The Cloudflare account used by Wrangler must own the
active `rajmathuria.me` zone. Do not create a manual A record for the Worker
hostname. Keep existing `api.rajmathuria.me` unchanged.

All pushes, including collaborator pushes to feature branches, run the five
workflow checks. Production deployment is intentionally restricted to
`main`: merge or push reviewed changes to `main` to update the live backend
and, when enabled, frontend. Feature-branch pushes do not replace production.

### Runbook: from a broken pipeline to a green deploy

1. **GCP IAM (run once, needs the GCP project owner).**

   ```bash
   GOOGLE_CLOUD_PROJECT=major-project-512815 bash infra/deploy/gcp-bootstrap.sh
   ```

   Without this, the backend job fails with the Cloud Build staging-bucket
   permission error.

2. **Cloudflare API token (run once, needs the Cloudflare account owner).**
   Create a token with **Account > Workers Scripts > Edit** at
   **My Profile > API Tokens**, then add it as the repository secret
   `CLOUDFLARE_API_TOKEN`. `CLOUDFLARE_ACCOUNT_ID` and `DEPLOY_FRONTEND=true`
   are already set.

3. **Grafana needs no DNS.** It is served at
   `https://sprintsmith-api.rajmathuria.me/grafana/` on the existing API
   hostname. Optionally add an `A` record `grafana` -> `34.9.97.6` and switch
   `GRAFANA_ROOT_URL`/`GRAFANA_SERVE_FROM_SUB_PATH` for a dedicated hostname.

4. **Push or dispatch.** Commit and push to `main`, or use
   **Actions > Production Deployment > Run workflow**:

   ```bash
   git status --short
   git add .gcloudignore .github/workflows README.md docs infra/deploy infra/observability infra/db/init.sql
   git commit -m "Fix production pipeline and rename to SprintSmith"
   git push origin main
   ```

5. **Monitor.** In **Actions**, the `Production Deployment` run has two jobs:
   `Build and deploy backend to GCP` (Cloud Build + VM rollout) and
   `Deploy frontend to Cloudflare Workers`. They are independent, so a
   backend failure no longer skips the frontend job.

6. **Verify the live endpoints:**

   ```bash
   curl --fail https://sprintsmith-api.rajmathuria.me/health
   curl --fail https://sprintsmith-api.rajmathuria.me/health/db
   curl --fail https://sprintsmith-api.rajmathuria.me/health/ai
   curl --fail https://sprintsmith-api.rajmathuria.me/grafana/api/health
   ```

   Open `https://sprintsmith-api.rajmathuria.me/docs`, `https://app.rajmathuria.me`,
   and `https://sprintsmith-api.rajmathuria.me/grafana/` (login with the
   `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` from
   `/opt/sprintsmith/.env`).

If frontend deployment is not ready yet, set `DEPLOY_FRONTEND` to `false`;
backend deployment still runs on `main`. To manually retry a failed deployment,
use **Actions > Production Deployment > Run workflow** on `main`. Local
build/deploy remains available with `bash infra/deploy/deploy-gcp.sh`.

## Constraints

- No cloud credentials or service-account keys are stored in this repository.
- The AI-engine image is large and CPU-heavy because it includes Docling and document models.
- Free hosting is quota-based and may require payment verification.
- Configure backups, monitoring retention, and model API limits before real user data.
