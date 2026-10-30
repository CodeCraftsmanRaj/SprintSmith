# GCP setup for the project owner

This is the one-time GCP work required to make the SprintSmith GitHub Actions
pipeline deploy the backend. Everything else (secrets, DNS, deployments) is
already configured from GitHub/Cloudflare.

## What is failing

Every push to `main` fails in the `Build and deploy backend to GCP` job with:

```text
ERROR: (gcloud.builds.submit) The user is forbidden from accessing the bucket
[major-project-512815_cloudbuild]. Please check your organization's policy or
if the user has the "serviceusage.services.use" permission.
```

The GitHub Actions workflow authenticates to GCP with Workload Identity
Federation and acts as the service account
`sprintsmith-github-deploy@major-project-512815.iam.gserviceaccount.com`. That
service account can log in, but the project has not yet granted it permission
to submit Cloud Build jobs or write the build's source archive to the Cloud
Build staging bucket. A project owner must apply the IAM setup below before
rerunning the failed GitHub Actions workflow; changing workflow code alone
cannot grant these GCP permissions.

## What the service account will be allowed to do

Only what the deployment needs:

- Submit Cloud Build jobs and read their status.
- Read/write the Cloud Build staging bucket `gs://major-project-512815_cloudbuild`.
- Push images to the Artifact Registry repository `sprintsmith-repo`.
- Act as the Cloud Build service account (so builds can run).
- Pull images from the VM (`sprintsmith-backend`) at rollout time.

No application secrets are involved: they live in `/opt/sprintsmith/.env` on
the VM.

## Option A — run the bootstrap script (recommended)

The repository ships `infra/deploy/gcp-bootstrap.sh`. It is idempotent and
safe to re-run. From a checkout in GCP Cloud Shell (or any machine with
`gcloud` authenticated to `major-project-512815`):

```bash
git clone https://github.com/CodeCraftsmanRaj/SprintSmith.git
cd SprintSmith
gcloud auth login          # skip if already authenticated
GOOGLE_CLOUD_PROJECT=major-project-512815 bash infra/deploy/gcp-bootstrap.sh
```

## Option B — run the individual gcloud commands

If you prefer not to run a script from the repository:

```bash
PROJECT_ID=major-project-512815
REGION=us-central1
VM_NAME=sprintsmith-backend
ZONE=us-central1-a
DEPLOY_SA="sprintsmith-github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
STAGING_BUCKET="gs://${PROJECT_ID}_cloudbuild"

# 1. APIs
gcloud services enable \
  cloudbuild.googleapis.com artifactregistry.googleapis.com \
  compute.googleapis.com iam.googleapis.com serviceusage.googleapis.com \
  --project "$PROJECT_ID"

# 2. Deploy service account must exist
gcloud iam service-accounts describe "$DEPLOY_SA" --project "$PROJECT_ID" >/dev/null ||
  gcloud iam service-accounts create sprintsmith-github-deploy \
    --display-name="SprintSmith GitHub deployment" --project "$PROJECT_ID"

# 3. Permissions to submit builds (this is what is failing today)
for role in roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOY_SA" --role="$role" --condition=None --quiet >/dev/null
done

# 4. Staging bucket (source upload target for `gcloud builds submit`)
gcloud storage buckets describe "$STAGING_BUCKET" --project "$PROJECT_ID" >/dev/null ||
  gcloud storage buckets create "$STAGING_BUCKET" \
    --project "$PROJECT_ID" --location "$REGION" --uniform-bucket-level-access
for sa in "$DEPLOY_SA" "$BUILD_SA" "$COMPUTE_SA"; do
  gcloud storage buckets add-iam-policy-binding "$STAGING_BUCKET" \
    --member="serviceAccount:${sa}" --role="roles/storage.admin" \
    --project "$PROJECT_ID" >/dev/null
done

# 5. Artifact Registry repository for the built images
gcloud artifacts repositories describe sprintsmith-repo \
  --location "$REGION" --project "$PROJECT_ID" >/dev/null ||
  gcloud artifacts repositories create sprintsmith-repo \
    --repository-format=docker --location="$REGION" \
    --description="SprintSmith container images" --project "$PROJECT_ID"
for sa in "$BUILD_SA" "$COMPUTE_SA"; do
  gcloud artifacts repositories add-iam-policy-binding sprintsmith-repo \
    --location "$REGION" --member="serviceAccount:${sa}" \
    --role="roles/artifactregistry.writer" --project "$PROJECT_ID" >/dev/null
done

# 6. VM service account can pull the images at rollout
VM_SA="$(gcloud compute instances describe "$VM_NAME" --zone "$ZONE" \
  --project "$PROJECT_ID" --format='value(serviceAccounts[0].email)' 2>/dev/null)"
[ -n "$VM_SA" ] && gcloud artifacts repositories add-iam-policy-binding sprintsmith-repo \
  --location "$REGION" --member="serviceAccount:$VM_SA" \
  --role="roles/artifactregistry.reader" --project "$PROJECT_ID"
```

## Option C — click it in the Cloud Console

**IAM & Admin > IAM**, find member
`sprintsmith-github-deploy@major-project-512815.iam.gserviceaccount.com` and
add these project-level roles:

- `Cloud Build Editor`
- `Service Usage Consumer`
- `Service Account User`

Then **Storage > Buckets > `major-project-512815_cloudbuild` > Permissions**:
add the same service account as **Storage Admin**. If the bucket does not
exist, **Artifact Registry > Repositories**: create `sprintsmith-repo`
(Docker, `us-central1`) and grant `Storage Admin` on the bucket plus
`Artifact Registry Writer` on the repository to
`${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com`.

## Optional: SSH/SCP for the rollout

The pipeline also copies files to the VM and restarts the containers over
`gcloud compute ssh`. That already worked in earlier runs. If it ever fails
with a permission error, grant the deploy service account OS Login access:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_SA" \
  --role=roles/compute.osAdminLogin --condition=None --quiet
```

## Verify it worked

```bash
gcloud projects get-iam-policy major-project-512815 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:sprintsmith-github-deploy" \
  --format="table(bindings.role)"

gcloud storage buckets get-iam-policy gs://major-project-512815_cloudbuild \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:sprintsmith-github-deploy@major-project-512815.iam.gserviceaccount.com" \
  --format="table(bindings.role,bindings.members)"
```

The project policy must list `roles/serviceusage.serviceUsageConsumer`, and the
bucket policy must list `roles/storage.admin` for the deploy service account.
The deployment script reports the active GCP account and the matching bucket
binding if Cloud Build still cannot upload its source. If the bindings are
present but access is still denied, check IAM conditions and organization
policies; rerunning the bootstrap will not override a policy-level deny.

The GitHub Actions `Production Deployment` workflow can then be re-run from
**Actions > Production Deployment > Run workflow** on `main`.
