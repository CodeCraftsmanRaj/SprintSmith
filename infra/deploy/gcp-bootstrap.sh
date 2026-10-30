#!/usr/bin/env bash
# One-time GCP bootstrap for the SprintSmith production pipeline.
#
# Run this as a project owner (or a role that can grant IAM and create
# resources) before the first GitHub Actions deployment:
#
#   GOOGLE_CLOUD_PROJECT=major-project-512815 \
#     bash infra/deploy/gcp-bootstrap.sh
#
# It is idempotent. It does not create or read application secrets; those stay
# in /opt/sprintsmith/.env on the VM.
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-us-central1-a}"
VM_NAME="${GCP_VM_NAME:-sprintsmith-backend}"
REPOSITORY="${ARTIFACT_REGISTRY_REPOSITORY:-sprintsmith-repo}"
DEPLOY_SA_EMAIL="${DEPLOY_SA_EMAIL:-sprintsmith-github-deploy@${PROJECT_ID}.iam.gserviceaccount.com}"
STAGING_BUCKET="${STAGING_BUCKET:-gs://${PROJECT_ID}_cloudbuild}"

log() {
	printf '\n==> %s\n' "$*"
}

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
	echo "Set GOOGLE_CLOUD_PROJECT or configure a gcloud project." >&2
	exit 1
fi

log "Project: ${PROJECT_ID} (region ${REGION})"
gcloud config set project "$PROJECT_ID" >/dev/null

log "Enabling required Google Cloud APIs"
gcloud services enable \
	cloudbuild.googleapis.com \
	artifactregistry.googleapis.com \
	compute.googleapis.com \
	iam.googleapis.com \
	serviceusage.googleapis.com \
	--project "$PROJECT_ID"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

log "Ensuring the build service accounts are enabled"
for sa in "$CLOUD_BUILD_SA" "$COMPUTE_SA"; do
	gcloud iam service-accounts enable "$sa" --project "$PROJECT_ID" >/dev/null 2>&1 \
		|| echo "Note: ${sa} could not be enabled (it may not exist in this project)."
done

log "Ensuring the GitHub deploy service account exists"
if ! gcloud iam service-accounts describe "$DEPLOY_SA_EMAIL" \
	--project "$PROJECT_ID" >/dev/null 2>&1; then
	gcloud iam service-accounts create "${DEPLOY_SA_EMAIL%%@*}" \
		--display-name="SprintSmith GitHub deployment" \
		--project "$PROJECT_ID"
fi

log "Granting Cloud Build submit permissions to ${DEPLOY_SA_EMAIL}"
for role in \
	roles/cloudbuild.builds.editor \
	roles/serviceusage.serviceUsageConsumer \
	roles/iam.serviceAccountUser; do
	gcloud projects add-iam-policy-binding "$PROJECT_ID" \
		--member="serviceAccount:${DEPLOY_SA_EMAIL}" \
		--role="$role" \
		--condition=None \
		--quiet >/dev/null
done

log "Ensuring the Cloud Build staging bucket ${STAGING_BUCKET}"
if ! gcloud storage buckets describe "$STAGING_BUCKET" \
	--project "$PROJECT_ID" >/dev/null 2>&1; then
	gcloud storage buckets create "$STAGING_BUCKET" \
		--project "$PROJECT_ID" \
		--location "$REGION" \
		--uniform-bucket-level-access
fi
for sa in "$DEPLOY_SA_EMAIL" "$CLOUD_BUILD_SA" "$COMPUTE_SA"; do
	gcloud storage buckets add-iam-policy-binding "$STAGING_BUCKET" \
		--member="serviceAccount:${sa}" \
		--role="roles/storage.admin" \
		--condition=None \
		--project "$PROJECT_ID" >/dev/null
done

log "Ensuring the Artifact Registry repository ${REPOSITORY}"
if ! gcloud artifacts repositories describe "$REPOSITORY" \
	--location "$REGION" \
	--project "$PROJECT_ID" >/dev/null 2>&1; then
	gcloud artifacts repositories create "$REPOSITORY" \
		--repository-format=docker \
		--location="$REGION" \
		--description="SprintSmith container images" \
		--project "$PROJECT_ID"
fi
for sa in "$CLOUD_BUILD_SA" "$COMPUTE_SA"; do
	gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" \
		--location "$REGION" \
		--member="serviceAccount:${sa}" \
		--role="roles/artifactregistry.writer" \
		--project "$PROJECT_ID" >/dev/null
done

log "Granting the VM service account image pull access"
VM_SA="$(gcloud compute instances describe "$VM_NAME" \
	--zone "$ZONE" \
	--project "$PROJECT_ID" \
	--format='value(serviceAccounts[0].email)' 2>/dev/null || true)"
if [[ -n "$VM_SA" ]]; then
	gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" \
		--location "$REGION" \
		--member="serviceAccount:${VM_SA}" \
		--role="roles/artifactregistry.reader" \
		--project "$PROJECT_ID" >/dev/null
	echo "VM service account: ${VM_SA}"
else
	echo "Warning: VM ${VM_NAME} was not found in ${ZONE}; grant Artifact Registry Reader to its service account manually." >&2
fi

cat <<EOF

Bootstrap complete.

Next:
  1. Confirm the GitHub Actions workflow uses this deploy service account:
     ${DEPLOY_SA_EMAIL}
  2. If gcloud compute ssh/scp fails from GitHub Actions, grant the deploy
     service account OS Login access (roles/compute.osAdminLogin) or the
     metadata-SSH permission it needs.
  3. Run the production workflow on main.

Deploy service account: ${DEPLOY_SA_EMAIL}
Artifact Registry:      ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}
EOF
