# SprintSmith Frontend Enhancement — Repository Audit & API Contract Verification

**Phase:** Phase Zero (audit and architecture)  
**Date:** 2026-11-25  
**Base branch:** `origin/feature/orchestrated-artifact-pipeline` at `443ac19` ("Handle partial workflow metrics responses")  
**Implementation branch:** `implementation/enterprise-frontend` (dedicated worktree; no published history rewritten)  
**Status:** Audit complete. Implementation status and verification results are tracked in `docs/frontend-enhancement-report.md`.

> The pre-existing checkout at `C:\Users\Prathmesh Mohite\SprintSmith` was on `fix/regex-backtracking-issue-18` with four uncommitted files. That work was **not touched**. All changes here are made in an isolated git worktree.

---

## 1. Verification method

1. Read repository instructions (`frontend/AGENTS.md`, `backend-core/AGENTS.md`, `README.md`, `docs/frontend-api.md`, CI workflows).
2. Exported the live FastAPI schema offline with `from app.main import app; app.openapi()`: **48 paths**. This machine-readable inventory, plus the route/Pydantic source, is authoritative. `docs/frontend-api.md` is stale and under-reports routes.
3. Audited frontend routes, the live `Workspace` component, the API client, the test suite, and the legacy static HTML prototypes.
4. Audited backend router mounting, response shapes, RBAC, rate limiting, migrations, and missing capabilities.
5. Ran baseline checks **before changing application code**:

| Check | Baseline result | Notes |
| --- | --- | --- |
| `npm ci` | Passed | 558 packages; npm audit: 11 moderate, 1 high (tracked, not blindly auto-fixed). |
| `npm run lint` | Failed | 10,406 problems, of which 10,397 were `prettier/prettier` CR/LF complaints caused by `core.autocrlf=true` on Windows. |
| `npm run test` | Passed | 25 files / 183 tests. |
| `npm run build` | Passed | Vite 8 / Nitro Cloudflare preset; warnings: ignored `inlineDynamicImports`, Wrangler `main`/`assets` overrides. |
| Backend `pytest -q` (target branch) | 245 passed / 4 failed | Failures are ordering/timestamp-tie assertions in `test_ingest_job_repo.py`, `test_evaluation_repo.py`, `test_history_repo.py`, and `test_feature_additions.py`. |
| Backend suite against the pre-existing checkout | 118 passed / 1 failed | Different test inventory; confirms at least three target-branch failures are baseline issues, not caused by this work. |

No baseline failure was hidden or represented as a pass.

---

## 2. Existing architecture (reuse inventory)

### 2.1 Frontend

| Area | Existing implementation | Reuse decision |
| --- | --- | --- |
| Framework | React 19, TypeScript strict, TanStack Start 1.168 / Router 1.170, Vite 8, Tailwind 4, Radix/shadcn primitives, lucide-react, Recharts 2, React Hook Form, Zod 4, TanStack Query 5, Vitest 4 + RTL. | Preserve; no second router, state manager or UI kit. |
| Routes | `__root.tsx` plus `/`, `/login`, `/overview`, `/plan`, `/audit`, `/verify`, `/synthesize`, `/prompts`. Every protected route renders the same `<ProtectedWorkspace />`. `routeTree.gen.ts` is generated. | Preserve deep links; add features as in-workspace views rather than a parallel routing system. |
| Auth guard | `ProtectedWorkspace.tsx` checks `localStorage["sprintsmith_access_token"]`, redirects to `/login`. `/auth/me` is the real validator. | Keep token mechanism; add role-aware UI from `/auth/me` and add token expiry handling. |
| Main UI | `src/screens/workspace.tsx` (~50 KB, 345 long lines) contains auth, project switcher, overview, requirements, artifacts, activity, renderer, export, and generation modal. | Incrementally decompose; do not replace wholesale. |
| Static design screens | `src/screens/{overview,ingest,plan,verify,synthesize,audit,prompts,shell,login}.ts` export HTML strings from a prototype. They are **not routed React screens** and contain hardcoded Barclays/payment mock data. | Treat as design references only; never present their hardcoded values as product data. |
| Design system | `src/styles.css` — dark palette, utility classes (`panel`, `button`, `metric-card`, `table-scroll`, `empty-state`, `modal`) and breakpoints at 1050/800/620/540 px. Radix primitives exist under `src/components/ui/*` but the live workspace barely consumes them. | Reuse existing tokens/classes and primitives; avoid a new theme engine. |
| API client | `src/lib/backend-api.ts` — `api<T>(path, token, init)` with bearer header, JSON/FormData handling, 204 and basic error normalization. No timeout, abort, retry, blob download, or token provider. | Keep exported `api`/`apiUrl` for compatibility; internals now live in `src/lib/api/`. |
| Data normalization | Workspace has local `asRecord`/`asList`/`asText`/`humanize` and partial-metric guards from commit `443ac19`. | Promoted to shared `src/lib/normalize.ts`; all new panels use it. |
| Tests | 25 files / 183 baseline tests. `workspace-auth.test.tsx` asserts the public registration UI and must be updated when signup is removed. Workflow metrics UI had no direct test. | Extend with contract, normalization, permission, and component tests. |

### 2.2 Backend

- Two FastAPI services: gateway `backend-core/backend` (default local port 8002 for the frontend) and private AI engine `backend-core/ai-engine` (port 8001). The browser talks only to the gateway.
- `backend/app/main.py:14-22,57-66` imports and mounts **all nine** `app/api/v1` routers (health at root; auth/projects/requirements/artifacts/generate/audit/prompts/runs under `/api/v1`). The AGENTS note claiming routers are "NOT mounted" is stale. The only inline route is hidden `GET /metrics`.
- Auth: JWT bearer; global roles `member`/`admin`, project roles `owner`/`editor`/`viewer`. Admin-only: audit logs, batch evaluation, prompt writes/test, orchestration prompt create. Editor+ for generation, upload, compare, chat, case study, workflow start/decisions.
- Rate limiting **exists** in `app/main.py:73-105`: 10 requests/60 s per IP for login/register; 30 requests/60 s per IP for project generate POSTs; `429` with `Retry-After`.
- Persistence: SQLAlchemy + Alembic chain through `0008_requirement_lifecycle`. Requirements have content/category/tags/priority/review status/version/`index_stale`, optimistic concurrency via `expected_version` → `409` with `current_version`, and version snapshots.
- AI/workflow: async ingest jobs, generation + SSE stream + compare + chat + case study, LangGraph orchestrated runs with events/SSE/reconnect and approve/reject/revise/resume, run metrics, traceability built from generation history, project stats, prompt registry with governance, exports.
- External docs are stale; this audit supersedes `docs/frontend-api.md`.

---

## 3. Feature-by-feature audit and classification

Legend: **Implemented** · **Partial** · **Frontend missing** · **Backend missing** · **Integration mismatch** · **Requires enhancement**.

| # | Requested functionality | Current state | Classification | Security / dependency note | Priority |
| --- | --- | --- | --- | --- | --- |
| 1 | Login, session, logout | JWT login + `/auth/me`; token in localStorage; 401 sign-out exists in workspace | **Partial**: no RHF/Zod validation, no password visibility, no expiry metadata | Backend rate-limits login; no refresh/revoke/logout endpoint | P0 |
| 2 | Public signup removal | Live signup UI and tests exist; backend `/auth/register` is public | **Requires enhancement**: remove UI now; gate server-side as a separate blocker | Registration accepted a client-supplied `role` and could create an admin. **Fixed in this work** (see §6). UI removal alone is not sufficient | P0 |
| 3 | Authorized-account provisioning | No bootstrap config found | **Backend missing**: env-driven initial admin / allowlist | Provision with hashed passwords; never hardcode credentials | P0 |
| 4 | Admin dashboard | `/audit-logs`, health endpoints, batch evaluation exist; no user list | **Partial / backend missing** | Admin role enforced server-side; UI gating is cosmetic | P1 |
| 5 | Project create/edit/delete/list/members | CRUD + add member (editor/viewer only) exist; workspace only creates/switches | **Partial**: edit/delete/member UI missing; no archive concept | Owner/admin enforced by service | P1 |
| 6 | Invitations pending/accept/decline | None | **Backend missing** | Invite tokens must expire and be single-use | P2 |
| 7 | Requirement lifecycle UI | Upload/list + API lifecycle exist | **Frontend missing**: detail, edit, approve/reject, versions, `index_stale`, 409 conflict dialog | Editor+ for writes; preserve local edits on 409 | P0 |
| 8 | Artifact generation and run status | Generation, stream, compare, runs/events exist | **Partial**: wizard exists; no run list/detail/approval UI | Generate requires editor+; no fabricated progress | P1 |
| 9 | Artifact detail / evaluation / export | Get/patch/evaluations/exports exist; workspace has formatted+JSON view and local `.md` download | **Partial**: wire real export formats and evaluation UI | Gherkin **is** supported; PDF is not. Never claim an unsupported format succeeded | P1 |
| 10 | Artifact Kanban with persistent status/order | No status/order/assignee fields in DB or `ArtifactUpdate` | **Backend missing** | A UI-only Kanban would fake persistence; blocked until migration lands | P2 |
| 11 | Artifact list/table (sort/filter/select) | Data available via project artifacts endpoint | **Requires enhancement** (frontend) | No new permissions | P2 |
| 12 | Dependency graph | No dedicated endpoint; traceability edges are requirement→artifact from generation history | **Backend missing / integration mismatch** | Do not invent inter-artifact edges | P2 |
| 13 | Traceability graph + matrix + coverage | `GET /projects/{id}/traceability` returns `{nodes, edges}` | **Frontend missing** | Coverage computed only from returned links; no invented percentages | P1 |
| 14 | Evaluation baselines / trends | Create/list per artifact, project average/trend, admin batch exist; no baselines | **Partial / backend missing** | Label unavailable metrics "Not evaluated" | P2 |
| 15 | OpenAPI preview workspace | `api_spec` artifacts carry generated endpoint structures; backend `/docs` is separate | **Frontend missing** | Validate schema before rendering; escape content | P2 |
| 16 | Prompt library + versions + tests | Engine-backed list/read/create/test + DB orchestration versions exist; prompt writes are admin-only | **Frontend missing**: static prototype only | Admin-only write UI must be hidden for members | P1 |
| 17 | Exports | JSON/MD/Markdown/CSV/YAML/YML/Gherkin artifact export, backlog proxy, ZIP export exist | **Partial**: only local markdown download in UI | Correct ZIP path is `/projects/{id}/artifacts/export.zip`; validate blob size/type | P1 |
| 18 | Dashboard analytics | Stats, history, run metrics, monitoring dashboard, audit logs exist | **Partial**: workspace uses counts + defensive run metrics | All partial fields must be normalized | P0 |
| 19 | Global search / notifications / help / theme | Search filters artifacts only; notification dot and Settings/Help are inert | **Frontend missing / backend missing** | No fake notification counts; local filtering only | P3 |
| 20 | Responsive / accessible UI | CSS breakpoints and Radix primitives exist | **Requires enhancement** | Focus states, dialogs, keyboard alternatives, aria live regions | P1 |

### Classification summary

- **Already implemented (reusable backend):** requirement lifecycle, generation/stream/compare/chat/case study, workflow runs with events/SSE/decisions, evaluations, project stats/history, traceability, prompt registry/governance, exports, audit logs, rate limiting.
- **Partially implemented (frontend):** login, projects, ingestion/list, artifact list/detail, generation wizard, overview metrics.
- **Frontend missing:** admin dashboard, requirement editor/review/versions, runs UI, traceability, evaluation comparison, OpenAPI explorer, prompt library, backend exports, global search, notifications.
- **Backend missing:** admin user CRUD/list, invitations, artifact workflow fields, dependency graph, baselines, password reset/lockout state, notifications/global search, PDF export, authorized-account bootstrap.
- **Integration mismatch:** static `screens/*.ts` prototypes look like pages but are not wired; `docs/frontend-api.md` under-reports routes; AGENTS convention note about unmounted routers is stale.
- **Requires enhancement:** API client, normalization, signup removal, design-system consistency.

---

## 4. API integration matrix (verified from `app.openapi()` and route source)

Permissions reflect route/service checks. "Editor+" means project `owner`/`editor`; "Admin" is the global role. Enveloped responses are unwrapped in `src/lib/api/endpoints.ts`.

| Feature | Endpoint | Method | Request | Response | Permission | Frontend handling |
| --- | --- | --- | --- | --- | --- | --- |
| Login | `/api/v1/auth/login` | POST | `{email,password}` | `Token` | public; 10/60s rate limit | generic error message |
| Current user | `/api/v1/auth/me` | GET | — | `UserOut` | auth | role-aware nav; 401 → sign out |
| Register | `/api/v1/auth/register` | POST | `UserCreate` | `UserOut` | public; 10/60s | **UI removed**; server gating remains a blocker |
| Artifact types | `/api/v1/artifact-types` | GET | — | engine dict | auth | normalize list |
| Projects | `/api/v1/projects` | GET/POST | `ProjectCreate` | `ProjectOut[]` / `ProjectOut` 201 | auth | list/create |
| Project detail/edit/delete | `/api/v1/projects/{id}` | GET/PATCH/DELETE | `ProjectUpdate` | `ProjectOut` / 204 | read: member; write: owner/admin | settings panel |
| Add member | `/api/v1/projects/{id}/members` | POST | query `email`, `role=editor\|viewer` | dict 201 | owner/admin | member form |
| Project history | `/api/v1/projects/{id}/history` | GET | — | list | member | activity feed |
| Upload requirement | `/api/v1/projects/{id}/requirements` | POST | multipart `file`, query `doc_type` | `{id,ingest_job_id,status}` 202 | editor+ | 413/415 surfaced |
| Ingest text | `/api/v1/projects/{id}/requirements/text` | POST | `{content,doc_type}` | dict 202 | editor+ | 10–50,000 char validation |
| Ingest job | `/api/v1/ingest-jobs/{jobId}` | GET | — | job dict | auth | poll; terminal `failed` on engine 404 |
| List/filter requirements | `/api/v1/projects/{id}/requirements` | GET | `category`, `priority`, `review_status`, `tag` | list | member | table + filters |
| Requirement detail | `/api/v1/requirements/{id}` | GET | — | dict | member | drawer |
| Save requirement | `/api/v1/requirements/{id}` | PATCH | `RequirementUpdate` + `expected_version` | dict; 409 | editor+ | conflict dialog |
| Review requirement | `/api/v1/requirements/{id}/review` | POST | `RequirementReview` + `expected_version` | dict; 409 | editor+ | approve/reject |
| Requirement versions | `/api/v1/requirements/{id}/versions` | GET | — | `{versions:[...]}` | member | history list |
| Generate artifact | `/api/v1/projects/{id}/generate` | POST | `GenerateRequest` | `ArtifactOut` 201 | editor+; approved requirement | wizard |
| Generate stream | `/api/v1/projects/{id}/generate/stream` | POST | `GenerateRequest` | SSE; 502 | editor+; 30/60s | event feed |
| Compare models | `/api/v1/projects/{id}/compare` | POST | `GenerateRequest` | `{primary,fallback}` | editor+ | evaluation panel |
| Chat | `/api/v1/projects/{id}/chat` | POST/GET | `{message}` / `limit` | dict / list | editor+ / member | optional panel |
| Case study | `/api/v1/projects/{id}/case-study` | POST/GET | `limit` / query | dict | editor+ | optional panel |
| Workflow runs | `/api/v1/projects/{id}/runs` | GET/POST | `StartWorkflowRunRequest` | `{runs:[...]}` / dict 201 | member / editor+ | run list/detail |
| Run detail/events/stream | `/api/v1/runs/{id}`, `/events`, `/stream` | GET | `Last-Event-ID` for SSE | dict / `{events:[...]}` / SSE | member | event timeline |
| Run decisions | `/api/v1/runs/{id}/approve\|reject\|revise\|resume` | POST | `ResumeWorkflowRunRequest` | dict | editor+ | decision controls |
| Run metrics | `/api/v1/projects/{id}/runs/metrics` | GET | — | `WorkflowRunMetrics` | member | normalize partial fields |
| Project stats | `/api/v1/projects/{id}/stats` | GET | — | stats dict | member | analytics cards |
| Traceability | `/api/v1/projects/{id}/traceability` | GET | — | `{nodes,edges}` | member | graph + matrix |
| Artifacts | `/api/v1/projects/{id}/artifacts` | GET | — | `ArtifactOut[]` | member | table/list |
| Artifact detail/edit | `/api/v1/artifacts/{id}` | GET/PATCH | `ArtifactUpdate` (`title`,`content` only) | `ArtifactOut` | member / editor+ | detail drawer |
| Artifact export | `/api/v1/artifacts/{id}/export?format=` | GET | `json\|markdown\|md\|csv\|yaml\|yml\|gherkin` | blob | member | Blob download |
| Backlog export | `/api/v1/artifacts/{id}/export/backlog` | POST | `BacklogExportRequest` | engine result | member | dry-run by default |
| ZIP export | `/api/v1/projects/{id}/artifacts/export.zip` | GET | — | ZIP blob | member | Blob download |
| Evaluations | `/api/v1/artifacts/{id}/evaluations` | GET/POST | `EvaluationCreate` (score 1–5) | list / dict 201 | member / editor+ | "Not evaluated" state |
| Sprint analysis | `/api/v1/artifacts/{id}/sprint-analysis` | GET | — | dict | member | optional panel |
| Prompts | `/api/v1/prompts` | GET | — | `{artifact_types:{...}}` | auth | library list |
| Prompt detail/create/test | `/api/v1/prompts/{type}` | GET/POST, POST `/test` | dict | dict | read: auth; write/test: admin | admin-gated editor |
| Orchestration prompts | `/api/v1/prompts/orchestration/{node}/versions` | GET/POST | `OrchestrationPromptCreate` | `{versions:[...]}` / dict 201 | read: auth; create: admin | version table |
| Audit logs | `/api/v1/audit-logs?limit=100` | GET | — | list | **admin** | admin page |
| Batch evaluation | `/api/v1/evaluate/batch?project_id=&retrieval_mode=` | POST | query | dict | **admin** | admin action |
| Monitoring dashboard | `/api/v1/projects/{id}/monitoring-dashboard` | GET | — | `ProjectMonitoringDashboard` | member | external link / `available=false` |
| Health | `/health`, `/health/db`, `/health/ai` | GET | — | dict | public | admin/system card |

**Coverage summary:** 48 paths / ~57 operations. Only a minority declare typed Pydantic response models; most return inline dictionaries, so runtime normalization is mandatory. Hidden `GET /metrics` is excluded from OpenAPI.

---

## 5. Blocker register (missing backend capability)

| ID | Blocker | Minimum contract needed | Interim frontend behavior |
| --- | --- | --- | --- |
| B-1 | Public registration still enabled | Gate/remove `POST /auth/register`; add env-driven authorized bootstrap | Signup UI removed; login explains accounts are provisioned by an administrator |
| B-2 | Admin user management | `GET/POST/PATCH /admin/users`, disable/reset-password, counts | Show real audit logs + health; explicit "endpoint unavailable" state for users |
| B-3 | Password reset / session lifecycle | `POST /auth/forgot-password`, `/reset-password`, `/logout`, expiry metadata | Generic messages from backend; no local lockout simulation (rate limits already server-side) |
| B-4 | Collaboration lifecycle | invitation CRUD + accept/decline; member role update/removal | Existing add-member form only; pending invitations marked unsupported |
| B-5 | Artifact workflow fields | `status`, `priority`, `assignee_id`, `order` in DB + `ArtifactOut`/`PATCH`, 409 on stale | Kanban disabled until real persistence exists |
| B-6 | Dependency graph | explicit artifact relationships endpoint | Graph built only from traceability links actually returned |
| B-7 | Evaluation baselines | baseline create/list/versions + trend fields | Show generated artifact, real evaluations, "Not evaluated" otherwise |
| B-8 | PDF export | extend export format enum + binary response | Selectable formats limited to backend-supported list |
| B-9 | Notifications / global search | `GET /notifications`, `GET /search?q=` | Local filtering of loaded data; notification control informational only |

---

## 6. Security review

- **No hardcoded credentials found in frontend source.** `.env.example` files are templates; AI-engine `.env` with real keys is gitignored and must never be committed.
- **Role escalation fixed:** `UserCreate.role` allowed a public caller to submit `role: "admin"`, and `auth.py` explicitly assigned it. The schema field and override were removed; registration now always creates `member`. Added integration test `test_public_registration_cannot_assign_admin_role` (6/6 auth integration tests pass).
- **AI engine has no authentication.** Any exposed engine port permits prompt writes, generation, ingest and export. Deployment must keep it private to the gateway network. Documented; not changed here.
- JWT in `localStorage` is vulnerable to XSS. New UI must avoid `dangerouslySetInnerHTML` for API data, escape artifact content, and validate links (`http/https` only). `safeExternalHref` and `normalize.ts` helpers added for this.
- Admin actions must be denied server-side regardless of UI; prompt writes/test and audit/batch endpoints already enforce this.
- Upload size/type checks in the UI are UX only; backend enforces limits.
- CORS default allow-origin is `http://localhost:3000` while the frontend default API URL is port 8002; deployment configuration must set `allowed_origins` explicitly.
- Rate limiting exists for login/register and generation; no client-side lockout simulation will be added.
- npm audit baseline: 11 moderate + 1 high advisories; triage separately rather than `npm audit fix --force`.

---

## 7. Dependency assessment

| Need | Existing package | Decision |
| --- | --- | --- |
| Forms + validation | `react-hook-form`, `@hookform/resolvers`, `zod` | Use; no new form library |
| Server state | `@tanstack/react-query` | Use for new feature panels; no Redux/Zustand |
| Charts | `recharts` | Use where helpful; note deprecation warning, no forced upgrade |
| Icons/dialogs | `lucide-react`, Radix/shadcn `components/ui` | Use |
| Kanban DnD | not installed | Only add `@dnd-kit/*` if B-5 lands; keyboard fallback required regardless |
| Dependency graph | not installed | Draw a dependency-free SVG from real traceability nodes/edges; no `@xyflow/react` until B-6 |
| OpenAPI viewer | not installed | Read-only schema explorer from real artifact/spec data; no `swagger-ui-react` for untrusted content |
| API types | handwritten from live schema | Keep snapshot in `src/lib/api/types.ts`; consider `openapi-typescript` generation later |

---

## 8. Implementation plan (phase gates)

1. **Phase 1 — Audit + architecture:** this document; API matrix frozen; baselines recorded. ✅
2. **Phase 2 — Foundation:** CRLF/prettier config, shared normalization, typed API client/modules, tests. Gate: targeted tests green.
3. **Phase 3 — Auth + admin:** remove signup UI, update tests, role-aware navigation, admin panel over real audit/health/batch endpoints, backend role-escalation fix. Gate: lint/test/build.
4. **Phase 4 — Requirements + collaboration:** editor, review, versions, 409 dialog, member add form; blocker states documented.
5. **Phase 5 — Artifact workspace:** detail/evaluations/exports, list/table views, OpenAPI preview; Kanban/graph gated by blockers.
6. **Phase 6 — Traceability + evaluation + prompts + runs:** real graph/matrix, evaluation states, prompt library, run timeline/decisions.
7. **Phase 7 — Hardening + report:** regression suite, a11y checks, `docs/frontend-enhancement-report.md`, final lint/test/build and backend tests.

Each phase ends with: changed-file list, `npm run lint`, `npm run test`, `npm run build`, backend tests when backend changed, unresolved issues, and a committed working checkpoint.

---

## 9. Normalization discipline (regression guard)

Commit `443ac19` exists to handle partial workflow metric responses. All new code follows the same rule:

```ts
const metrics = asRecord(await api(...));
const variants = asArray(metrics.prompt_variant_metrics);
const count = asNumber(metrics.run_count); // 0 only for a real number
const score = formatScore(metrics.average_review_score); // "Not evaluated" when absent
```

Forbidden on any API-derived value before type verification: `.toLocaleString()`, `.toFixed()`, `.map()`, `.filter()`, `.length`, `new Date(...)`, `replaceAll(...)`.
