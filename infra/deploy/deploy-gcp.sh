#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-us-central1-a}"
VM_NAME="${GCP_VM_NAME:-sprintsmith-backend}"
REPOSITORY="${ARTIFACT_REGISTRY_REPOSITORY:-sprintsmith-repo}"
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
	if ! gcloud builds submit \
		--project "$PROJECT_ID" \
		--config infra/deploy/cloudbuild.yaml \
		--substitutions "_REGION=${REGION},_REPOSITORY=${REPOSITORY},_TAG=${TAG}" \
		.; then
		cat >&2 <<'EOF'

Cloud Build could not submit the source archive.

If the error mentions the Cloud Build staging bucket or
"serviceusage.services.use", the GitHub deploy service account is missing
permissions. A project owner must run once:

  bash infra/deploy/gcp-bootstrap.sh

The script grants Cloud Build submit/staging-bucket access, creates the
Artifact Registry repository, and grants image push/pull permissions.
EOF
		exit 1
	fi
fi

REMOTE_TMP="$(gcloud compute ssh "$VM_NAME" \
	--project "$PROJECT_ID" \
	--zone "$ZONE" \
	--command='mktemp -d /tmp/sprintsmith-deploy.XXXXXX')"

gcloud compute scp \
	--recurse \
	infra/deploy/compose.production.yaml \
	infra/deploy/Caddyfile \
	infra/deploy/prepare-vm-env.py \
	infra/observability \
	infra/db/init.sql \
	"${VM_NAME}:${REMOTE_TMP}/" \
	--project "$PROJECT_ID" \
	--zone "$ZONE"

gcloud compute ssh "$VM_NAME" \
	--project "$PROJECT_ID" \
	--zone "$ZONE" \
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
		sudo docker compose --env-file .env -f infra/deploy/compose.production.yaml pull
		sudo docker compose --env-file .env -f infra/deploy/compose.production.yaml up -d
		curl --fail --retry 20 --retry-delay 5 http://localhost:8002/health
		if ! curl --fail --retry 20 --retry-delay 5 https://sprintsmith-api.rajmathuria.me/health; then
			echo 'Local API is healthy, but public HTTPS failed. Point sprintsmith-api.rajmathuria.me to the VM static IP and verify Cloudflare TLS mode is Full (strict).' >&2
			exit 1
		fi
		if ! curl --fail --retry 5 --retry-delay 3 -o /dev/null https://grafana.rajmathuria.me/api/health; then
			echo 'Warning: Grafana is not reachable at https://grafana.rajmathuria.me. Add a Cloudflare DNS A record for grafana.rajmathuria.me -> the VM static IP.' >&2
		fi
		rmdir ${REMOTE_TMP}"

cat <<EOF
Deployed ${TAG} to ${VM_NAME}

  API:      https://sprintsmith-api.rajmathuria.me/health
  Frontend: https://app.rajmathuria.me
  Grafana:  https://grafana.rajmathuria.me

The Grafana admin password is stored in /opt/sprintsmith/.env (variable
GRAFANA_ADMIN_PASSWORD). Read it from the VM; never commit it.
EOF
