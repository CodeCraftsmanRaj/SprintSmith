# SprintSmith Team Presentation

## Presentation Format

Six speakers. Each speaker has approximately 2 to 3 minutes. Speaker 1 gives the product overview and connects the sections. Speakers 2 through 6 explain the five main technical components.

```text
Speaker 1: Product overview and complete architecture
Speaker 2: Frontend and backend product API
Speaker 3: Document ingestion and data persistence
Speaker 4: RAG, hybrid retrieval, and knowledge graph
Speaker 5: AI generation, evaluation, and model providers
Speaker 6: Docker, observability, CI/CD, and deployment
```

---

## Speaker 1: Product Overview and Architecture

Hello everyone. Our project is SprintSmith, an AI-assisted software delivery platform.

The main problem we address is that software requirements are often unstructured, spread across documents, and difficult to convert into consistent engineering work. SprintSmith allows users to upload requirements, organize them into projects, search the project knowledge, and generate structured software artifacts such as user stories, API specifications, test cases, architecture documents, and sprint plans.

The project is organized as a monorepo. The frontend is a TanStack Start and React application. The main backend gateway handles authentication, projects, document uploads, artifact storage, evaluations, history, and audit records. A separate AI engine handles document parsing, retrieval, model calls, and generation. PostgreSQL stores the application data, chunks, vectors, and graph information.

For local development, Docker Compose starts PostgreSQL, the platform API, the worker, Prometheus, and Grafana. The integrated backend and AI engine are available through the core profile. For production, the frontend is intended for Cloudflare Workers, while the stateful backend and AI services run on a Docker-capable VM. GitHub Actions connects testing, image publishing, and deployment.

The complete request flow is: the user interacts with the frontend, the frontend calls the backend gateway, the backend sends retrieval or generation work to the AI engine, and the result is stored and returned with citations, evaluation information, and telemetry.

The next speakers will explain the frontend and backend API, ingestion, RAG and graph retrieval, AI generation, and finally the operational CI/CD system.

---

## Speaker 2: Frontend and Backend API

I will explain the application-facing part of SprintSmith.

The frontend is built with React and TanStack Start. It provides the user experience for authentication, project selection, document upload, generation, artifact viewing, evaluation, and traceability. The frontend does not call the AI engine directly. It calls the backend gateway through a configured API URL. In local development this is the integrated backend on port 8002. In production the intended URL is `https://api.rajmathuria.me`.

The backend gateway is a FastAPI service. Its responsibilities include registering and authenticating users, issuing bearer tokens, enforcing project-level roles, creating projects, uploading requirements, polling ingestion jobs, requesting artifact generation, streaming generation events, comparing models, exporting artifacts, storing history, receiving evaluations, and exposing audit data.

This separation is important. The browser should never receive database credentials, model API keys, JWT signing secrets, or direct access to the AI engine. The backend is the security and business boundary. It checks user identity and permissions before calling internal services or returning project data.

The API is documented through OpenAPI and Swagger. Frontend developers can use the generated contract to build against endpoints for authentication, projects, requirements, generation, artifacts, evaluation, and traceability.

In production, the frontend is deployed separately from the backend. Cloudflare hosts the frontend Worker, while the API hostname points through Cloudflare to the backend VM. This allows us to update the frontend and backend independently while maintaining a stable API contract.

---

## Speaker 3: Document Ingestion and Persistence

I will explain what happens when a document enters the system.

The user uploads a requirement document through the frontend. The backend stores the requirement metadata and creates an asynchronous ingestion job. It returns a job identifier immediately instead of blocking the HTTP request while a large document is processed.

The AI engine loads the document and extracts text, headings, tables, page information, and other metadata. The ingestion pipeline normalizes the content into blocks and builds a hierarchical tree. For example, a document can become sections such as Authentication, Login, Password Reset, and Audit History.

The same parsed content is then split into child chunks. Every chunk stores metadata such as project ID, document ID, source path, title, page range, and the ID of the tree node that owns it. This parent-child relationship means a vector search result can always be connected back to a meaningful document section.

The system stores relational data in PostgreSQL. The backend stores users, projects, requirements, artifacts, evaluations, history, and audit records. The AI and platform paths store chunks and vectors. The worker stores basic graph entities and relationships. PostgreSQL with pgvector keeps the first architecture simple by combining relational data and semantic search in one database.

Ingestion is asynchronous and observable. The frontend polls the ingestion job until it becomes completed or failed. The system also keeps content hashes and job state so that future versions can support deduplication, retries, deletion, and re-indexing.

This design keeps long-running document work out of the web request process and gives us a clean path toward queues, retries, object storage, and larger document collections.

---

## Speaker 4: RAG, Hybrid Retrieval, and Knowledge Graph

I will explain the retrieval system, which is the main RAG component.

RAG means Retrieval-Augmented Generation. Before an AI model creates an artifact, SprintSmith retrieves relevant project-specific context and includes it in the prompt. The model therefore has access to the user’s documents instead of relying only on general training knowledge.

Our retrieval strategy is hybrid. The first leg is vector retrieval. The document chunks are converted into embeddings, and PGVector finds semantically similar chunks. This handles meaning. For example, a query about credentials may retrieve a section that says authentication even if the exact word is not repeated.

The second leg is the knowledge-tree retrieval path. It selects relevant document sections and can preserve the hierarchy of the original document. This handles structure and broader section context.

Both legs run concurrently. Vector retrieval has a hard deadline because it is required for a useful result. The tree leg has a soft deadline. If the tree selector times out or fails, the system degrades to vector-only retrieval and records the reason in the trace rather than silently hiding the problem.

The two rankings are fused using Reciprocal Rank Fusion. Each result receives a score based on its rank in each retrieval list. Duplicate sections are merged using their node ID. The final context is trimmed to a token budget, and each item keeps provenance including source leg, title, page range, and score.

The knowledge graph also supports entity and relationship information. The worker extracts named entities and stores relationships with source-chunk provenance. This is the foundation for future GraphRAG features such as entity expansion, relationship traversal, and multi-hop context.

The result is context that is semantic, structural, traceable, and bounded before it reaches the model.

---

## Speaker 5: AI Generation, Evaluation, and Providers

I will explain how retrieved context becomes a final engineering artifact.

The AI engine uses a LangGraph state graph. The first node retrieves context exactly once. The Product Manager node creates a draft using the requirement, retrieved context, and the selected artifact schema.

The Quality Assurance node then validates the output. First, it checks whether the response is valid JSON and matches the expected Pydantic schema. Then an LLM judge scores the artifact on faithfulness to the requirement, completeness, and quality for the selected artifact type.

The approval threshold is 0.80. If the score is below the threshold, the critique is sent back to the draft node. The system can revise up to two times. If retries are exhausted, the best available draft is accepted and the response records the score and retry count.

The artifact type determines the schema and prompt template. This allows the same generation system to support user stories, API specifications, architecture documents, test cases, sprint plans, and acceptance criteria while still returning structured output.

The model layer is provider-neutral. Groq can provide fast generation, Gemini can provide embeddings and fallback behavior, and additional providers can be added behind the provider abstraction. Credentials are injected as environment variables and are never sent to the frontend or committed to Git.

Every generation can return operational information such as model used, prompt version, token usage, latency, evaluation score, retry count, and retrieval trace. This makes the AI system measurable instead of treating it as an opaque API call.

The evaluation dataset and offline tests help detect retrieval or generation regressions before deployment.

---

## Speaker 6: Docker, Observability, CI/CD, and Deployment

I will explain how the system is operated and delivered.

Docker Compose provides the repeatable local environment. The platform API, worker, PostgreSQL with pgvector, Prometheus, and Grafana can run as containers. The integrated backend and AI engine are enabled through the core profile. Separate images keep the API and worker boundaries clear.

The application emits structured logs with request IDs. Prometheus scrapes metrics such as request counts and latency. Grafana displays dashboards for traffic, response status, and latency. In a future production expansion, we should add ingestion, retrieval, model, token, queue, and cost metrics as well.

GitHub Actions provides several quality layers. Root CI runs Python linting, unit tests, and Compose validation. Backend-core CI runs backend tests and PostgreSQL migration/integration tests. AI-engine CI runs the offline retrieval and generation suite. The full-stack workflow starts the platform services and executes a smoke test.

The production deployment workflow publishes the backend and AI-engine images to GitHub Container Registry. When backend deployment is enabled, it connects to a Docker VM through SSH, pulls immutable commit-tagged images, runs database migrations, starts the services, and checks the backend health endpoint.

The frontend can deploy independently to Cloudflare Workers. The backend remains a separate deployment because PostgreSQL, the worker, and the AI engine require a Docker-capable host. Cloudflare DNS can expose `api.rajmathuria.me` for the backend and `app.rajmathuria.me` for the frontend without changing the existing portfolio domain.

This pipeline gives us reproducible builds, automated quality checks, deployment visibility, health verification, and a clear separation between stateless frontend hosting and stateful AI backend hosting.

---

## Closing Line For The Group

Together, SprintSmith is not only an LLM wrapper. It is a complete software platform: a frontend, secured backend gateway, asynchronous ingestion system, hybrid RAG retriever, knowledge graph foundation, structured generation workflow, evaluation layer, observability stack, and CI/CD deployment pipeline.
