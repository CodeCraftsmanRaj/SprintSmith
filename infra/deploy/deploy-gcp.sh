#!/usr/bin/env bash
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-us-central1-a}"
VM_NAME="${GCP_VM_NAME:-sprintsmith-backend}"
REPOSITORY="${ARTIFACT_REGISTRY_REPOSITORY:-sprintsmith-repo}"
STAGING_BUCKET="${STAGING_BUCKET:-gs://${PROJECT_ID}_cloudbuild}"
TAG="$(git rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
if [[ -n "${GCP_IMAGE_TAG:-}" ]]; then
	TAG="$GCP_IMAGE_TAG"
fi

if [[ ! "$TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
	echo "GCP_IMAGE_TAG contains characters not valid in a Docker tag." >&2
	exit 1
fi

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
	echo "Set GOOGLE_CLOUD_PROJECT or configure a gcloud project." >&2
	exit 1
fi

if [[ "${SKIP_BUILD:-false}" != "true" ]]; then
	ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
	echo "Submitting Cloud Build as: ${ACTIVE_ACCOUNT:-unknown}"
	echo "Cloud Build source staging bucket: ${STAGING_BUCKET}"
	if ! gcloud builds submit \
		--project "$PROJECT_ID" \
		--gcs-source-staging-dir="${STAGING_BUCKET}/source" \
		--config infra/deploy/cloudbuild.yaml \
		--substitutions "_REGION=${REGION},_REPOSITORY=${REPOSITORY},_TAG=${TAG}" \
		.; then
		cat >&2 <<'EOF'

Cloud Build could not submit the source archive.

Check the active account and its IAM bindings below. The GitHub Actions
deployment must use:

  sprintsmith-github-deploy@major-project-512815.iam.gserviceaccount.com

The account needs roles/serviceusage.serviceUsageConsumer on the project and
roles/storage.admin on the source staging bucket. A project owner can verify
the bindings with:

  gcloud projects get-iam-policy PROJECT_ID --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:ACTIVE_ACCOUNT" \
    --format="table(bindings.role,bindings.members)"
  gcloud storage buckets get-iam-policy STAGING_BUCKET \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:ACTIVE_ACCOUNT" \
    --format="table(bindings.role,bindings.members)"

If either binding is missing, a project owner can apply it with:

  gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:ACTIVE_ACCOUNT" \
    --role=roles/serviceusage.serviceUsageConsumer --condition=None --quiet
  gcloud storage buckets add-iam-policy-binding STAGING_BUCKET \
    --member="serviceAccount:ACTIVE_ACCOUNT" \
    --role=roles/storage.admin --condition=None --quiet

Replace ACTIVE_ACCOUNT with the account reported above. If both bindings are
present, inspect the bucket's IAM conditions and any organization policy that
could deny Cloud Storage access.
EOF
		echo "Active gcloud account: ${ACTIVE_ACCOUNT:-unknown}" >&2
		echo "Staging bucket IAM bindings for the active account:" >&2
		gcloud storage buckets get-iam-policy "$STAGING_BUCKET" \
			--flatten="bindings[].members" \
			--filter="bindings.members:serviceAccount:${ACTIVE_ACCOUNT}" \
			--format="table(bindings.role,bindings.members)" >&2 || \
			echo "Could not read the staging bucket IAM policy." >&2
		exit 1
	fi
fi

REMOTE_TMP="/tmp/sprintsmith-deploy-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"

gcloud compute ssh "$VM_NAME" \
	--project "$PROJECT_ID" \
	--zone "$ZONE" \
	--quiet \
	--command="mkdir -m 700 -- '${REMOTE_TMP}'"

gcloud compute scp \
	--recurse \
	infra/deploy/compose.production.yaml \
	infra/deploy/Caddyfile \
	infra/deploy/prepare-vm-env.py \
	infra/observability \
	infra/db/init.sql \
	"${VM_NAME}:${REMOTE_TMP}/" \
	--project "$PROJECT_ID" \
	--zone "$ZONE" \
	--quiet

gcloud compute ssh "$VM_NAME" \
	--project "$PROJECT_ID" \
	--zone "$ZONE" \
	--quiet \
	--command="set -e
		test -f /opt/sprintsmith/.env
		sudo mkdir -p /opt/sprintsmith/infra/deploy /opt/sprintsmith/infra/db
		sudo mv ${REMOTE_TMP}/compose.production.yaml /opt/sprintsmith/infra/deploy/
		sudo mv ${REMOTE_TMP}/Caddyfile /opt/sprintsmith/infra/deploy/
		sudo mv ${REMOTE_TMP}/prepare-vm-env.py /opt/sprintsmith/infra/deploy/
		sudo mv ${REMOTE_TMP}/init.sql /opt/sprintsmith/infra/db/
		sudo rm -rf /opt/sprintsmith/infra/observability
		sudo mv ${REMOTE_TMP}/observability /opt/sprintsmith/infra/observability
		sudo chmod 600 /opt/sprintsmith/.env
		sudo python3 /opt/sprintsmith/infra/deploy/prepare-vm-env.py
		sudo sed -i 's#^BACKEND_IMAGE=.*#BACKEND_IMAGE=${REGISTRY}/sprintsmith-backend-core:${TAG}#' /opt/sprintsmith/.env
		sudo sed -i 's#^AI_ENGINE_IMAGE=.*#AI_ENGINE_IMAGE=${REGISTRY}/sprintsmith-ai-engine:${TAG}#' /opt/sprintsmith/.env
		sudo gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
		cd /opt/sprintsmith
		# Every deploy uses a unique tag, so old images accumulate and can fill
		# the VM disk. Remove images not used by the running stack first.
		sudo docker image prune -af
		sudo docker builder prune -af >/dev/null 2>&1 || true
		sudo docker compose --env-file .env -f infra/deploy/compose.production.yaml pull
		sudo docker compose --env-file .env -f infra/deploy/compose.production.yaml up -d
		curl --fail --retry 20 --retry-delay 5 http://localhost:8002/health
		if ! curl --fail --retry 20 --retry-delay 5 https://sprintsmith-api.rajmathuria.me/health; then
			echo 'Local API is healthy, but public HTTPS failed. Point sprintsmith-api.rajmathuria.me to the VM static IP and verify Cloudflare TLS mode is Full (strict).' >&2
			exit 1
		fi
		if ! curl --fail --retry 5 --retry-delay 3 -o /dev/null https://sprintsmith-api.rajmathuria.me/grafana/api/health; then
			echo 'Warning: Grafana is not reachable at https://sprintsmith-api.rajmathuria.me/grafana/. Check the caddy and grafana container logs.' >&2
		fi
		rmdir ${REMOTE_TMP}"

cat <<EOF
Deployed ${TAG} to ${VM_NAME}

  API:      https://sprintsmith-api.rajmathuria.me/health
  Frontend: https://app.rajmathuria.me
  Grafana:  https://sprintsmith-api.rajmathuria.me/grafana/

The Grafana admin password is stored in /opt/sprintsmith/.env (variable
GRAFANA_ADMIN_PASSWORD). Read it from the VM; never commit it.
EOF
