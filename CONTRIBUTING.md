# Contributing to SprintSmith

Thank you for your interest in contributing to SprintSmith! We welcome bug
reports, feature proposals, documentation improvements, and code contributions.

## How we work

We follow a disciplined open-source workflow:

1. **Issue first** — Create an issue describing the problem or feature. Assign
   it to yourself when you start working on it.
2. **Branch** — Create a branch from `main` (e.g. `fix/123-description` or
   `feat/awesome-feature`).
3. **Develop** — Make your changes, add tests, and keep the branch in a working
   state.
4. **PR** — Open a pull request against `main`. All CI checks must pass
   (backend, AI engine, frontend, full-stack platform, quality, and SonarCloud
   quality gate).
5. **Review** — A maintainer will review. Merge only after the pipeline is
   green.
6. **Done** — Move the issue to Done on the project board.

## Assignees

When we fix an issue, the assignee is set to the person doing the work. If you
pick up an issue, assign it to yourself.

## Code quality

- Python: `uv sync --extra dev`, `uv run ruff check .`, `uv run pytest -q`
- Frontend: `npm ci && npm run test:coverage` in `frontend/`
- All PRs must pass the GitHub Actions quality gate before merging.
- Never force-push, rebase, amend, or squash already-pushed commits on
  connected branches (Lovable frontend rule).

## Security

Never commit secrets. Local secrets live in `SECRETS.local.md` (gitignored,
never pushed). Production secrets live in GitHub Secrets or on the GCP VM.

## Deployment

Deploys run on pushes to `main` after all test gates pass. The GCP VM may
occasionally be unreachable for SSH — contact the GCP project owner if
deployment fails at the SSH step.

## Getting help

Open an issue or ask in the project discussions. We're happy to help new
contributors get started.
