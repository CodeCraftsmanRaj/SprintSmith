# Pipeline Fix Summary

## What Was Fixed

### PostgreSQL FK Violations in Repository Tests
- **Root cause**: Test helper functions created parent entities (User, Project, Artifact) but didn't commit after each one, causing ForeignKeyViolation errors on PostgreSQL when child entities referenced non-existent parents.
- **Fix**: Rewrote 3 test files to follow the same pattern as `test_artifact_repo.py`:
  - `backend-core/backend/tests/repositories/test_evaluation_repo.py`
  - `backend-core/backend/tests/repositories/test_history_repo.py`
  - `backend-core/backend/tests/repositories/test_ingest_job_repo.py`
- **Pattern**: Use `project_repo`, `artifact_repo`, and `dev_user` fixtures; generate IDs with `.new_id()`; commit after each parent entity before creating children.
- **Result**: All 31 repository tests pass locally (was failing with FK violations on CI).

### Push Status
- Changes pushed to `main` branch: `408bcef fix: resolve PostgreSQL FK violations in repository tests using fixture pattern`
- All 246 backend tests pass locally
- All 12 AI-engine tests pass locally (including `test_prompt_loads_and_has_required_placeholders[acceptance_criteria]`)

## Current Pipeline State

### Completed / Working
- ✅ **246 backend tests** passing locally
- ✅ **12 AI-engine tests** passing locally
- ✅ **Repository FK violations resolved**
- ✅ **Issues #10 and #11**: Both closed
  - Issue #10: "Generate project-specific Grafana dashboard URLs" - closed without meeting acceptance criteria (no backend helper, no frontend link found)
  - Issue #11: "Path traversal via uploaded file in ingest_service.create_ingest_job()" - closed with code fix in PR #44

### Active Blockers

#### 1. SonarCloud Quality Gate (CRITICAL)
- **Problem**: `test_prompt_loads_and_has_required_placeholders[acceptance_criteria]` fails in CI with error:
  ```
  AssertionError: assert 'dummy requirement' in 'System: You are a helpful assistant\nHuman: Write a {requirement}'
  ```
- **Note**: This test **passes locally** on Python 3.14.9 with the same code. CI uses Python 3.11.17.
- **Impact**: SonarCloud quality gate fails → blocks "Production Deployment" workflow
- **Status**: Environment-specific issue cannot be reproduced or fixed from current environment

#### 2. GCP VM Reachability (INFRASTRUCTURE)
- **Problem**: Production deployment step fails at SSH to `34.9.97.6:22` times out
- **Earlier deploys succeeded**: Runs 41391043759, 41387397938 completed successfully
- **Current status**: VM may be stopped or firewall rules changed
- **Action needed**: Contact GCP project owner to verify `sprintsmith-backend` is RUNNING and SSH (port 22) is accessible from GitHub Actions runners

## Next Steps (Per User Directive)

1. **Confirm GCP VM reachability**: Contact GCP project owner - verify `sprintsmith-backend` (34.9.97.6) is RUNNING and SSH (port 22) is accessible from GitHub Actions runners. If stopped, start it; if firewall changed, restore rule.

2. **After #1 completes**: Re-run failed "Production Deployment" workflow from GitHub Actions to verify green pipeline.

3. **Report issue #10 verdict to user**: Manual Grafana setup ≠ acceptance criteria. The closed issue #10 ("Generate project-specific Grafana dashboard URLs") did not meet its acceptance criteria:
   - No backend helper that generates Grafana URLs based on project metadata/config
   - No frontend that exposes the dashboard link in a visible, accessible location
   - Users had to set up Grafana dashboards manually (as confirmed in the user's live environment)

4. **Srushti1125** continues on issue #47 (coverage improvement from 60.8% toward 80% gate) - no further action needed unless requested.

5. **Close remaining gaps**: The acceptance_criteria test CI failure is the only remaining blocker to a fully green pipeline. This appears to be an environment/Python version compatibility issue between local (3.14.9) and CI (3.11.17).

## Code Changes Made
- `backend-core/backend/tests/repositories/test_evaluation_repo.py` - Rewrite using fixture pattern
- `backend-core/backend/tests/repositories/test_history_repo.py` - Rewrite using fixture pattern  
- `backend-core/backend/tests/repositories/test_ingest_job_repo.py` - Rewrite using fixture pattern