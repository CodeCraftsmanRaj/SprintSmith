# DevPilot frontend

The frontend is a TanStack Start and React project. It connects to the backend gateway and uses its authentication, project, requirement ingestion, and artifact generation APIs.

## Run locally

Start only the database and the API services used by this frontend from the repository root:

```sh
docker compose --profile core up -d --build db backend-core ai-engine
```

The unrestricted Compose command also starts the separate API, worker, Prometheus, and Grafana services, which this frontend does not need.

Copy `.env.example` to `.env` if you need to change the API address. The default is `http://localhost:8002`.

Install frontend dependencies and start the app:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. In the Codex preview environment this is `http://localhost:8080`; other environments may choose another available port. `CORS_ORIGINS` includes ports 3000 and 8080 in the root `.env` and `.env.example`. If Vite prints a different origin, add it to `CORS_ORIGINS` and restart `backend-core`.
